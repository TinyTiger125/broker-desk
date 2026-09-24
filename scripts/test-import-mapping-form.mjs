#!/usr/bin/env node
// Real production derivation/action/state code; only repository I/O is an in-memory fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>fs.readFileSync(path,'utf8');
function load(source,globals={}){const compiledModule={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,FormData,...globals});return compiledModule.exports;}
function functions(path,names){const parsed=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true);return parsed.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)?'':'export ')+n.getText(parsed)).join('\n');}
const {getImportMappingFormRows:rows,getPropertyRowMappingPayload:parsePayload}=load(read('src/lib/import-mapping-form.ts'));
const mapping=load(read('src/lib/import-mapping.ts'));
const {isValidImportStatusTransition:transition}=load(functions('src/lib/data.postgres.ts',['isValidImportStatusTransition']));
const payload={kind:'property_row_import',headers:['物件名','所在地'],autoMapping:{'物件名':'name','所在地':'address'},rows:[{'物件名':'Synthetic','所在地':'Synthetic address'}],totalRows:1};
const notes=JSON.stringify(payload);let job={id:'job',sourceType:'excel',status:'mapped',mappingJson:{},notes};const audit=[];
assert.equal(JSON.stringify(rows(job)),JSON.stringify([{source:'物件名',target:'name'},{source:'所在地',target:'address'}]));
for(const broken of ['invalid',JSON.stringify({...payload,headers:[]}),JSON.stringify({...payload,autoMapping:[]})]) assert.equal(rows({...job,notes:broken}).length,0);
assert.equal(rows({...job,notes:'物件5件を保存',mappingJson:{'物件名':'name'}}).length,1);
assert.equal(rows({...job,notes:JSON.stringify({...payload,headers:[]}),mappingJson:{'物件名':'name'}}).length,0);
const {isBatchMappingJob}=load(functions('src/app/import-center/page.tsx',['isBatchMappingJob']),{getPropertyRowMappingPayload:parsePayload,isInputFileExtractionJob:()=>false});
assert.equal(isBatchMappingJob({...job,status:'queued'}),true);
assert.equal(isBatchMappingJob({...job,status:'queued',notes:'queued upload'}),false);
assert.equal(isBatchMappingJob({...job,status:'processing'}),false);
const page=read('src/app/import-center/page.tsx');
assert.match(page,/const defaultJob = focusJobId \? focusedMappingJob : mappingJobs\[0\]/);
const selection=page.match(/const defaultJob = ([^;]+);/)[1];
assert.equal(vm.runInNewContext(selection,{focusJobId:'missing',focusedMappingJob:undefined,mappingJobs:[{id:'other'}]}),undefined);
assert(page.includes('disabled={!hasEditableMapping}'));
assert(!page.includes('sourceColumnExamplesByLocale'));
const pageAst=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const expressions={};
function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)expressions[node.name.text]=node.initializer.getText(pageAst);ts.forEachChild(node,visit);}visit(pageAst);
function reopenPage(requestedJob,advanced=true,xlsx=false){const globals={requestedJob,xlsxJobId:xlsx?requestedJob.id:"",showAdvanced:advanced,hasAdvancedBatchPayload:false,xlsxJob:xlsx?requestedJob:undefined,focusedMappingJob:isBatchMappingJob(requestedJob)?requestedJob:undefined,getPropertyRowMappingPayload:parsePayload,hasCompletedBatchResult:false,inputExtractionPreview:null,hasPendingExceptions:false,isInputFileExtractionJob:()=>false};for(const key of ['isAdvancedMappingStep','isExtractedQueuedMapping','needsMappingRedirect','wizardStep','showPostProcessingContent','inputTaskJob'])globals[key]=vm.runInNewContext(expressions[key],globals);return globals;}
const queuedPage=reopenPage({...job,status:'queued'});assert.equal(queuedPage.wizardStep,'mapping');assert.equal(queuedPage.showPostProcessingContent,true);assert.equal(queuedPage.inputTaskJob,undefined);
const initialUpload=reopenPage({...job,status:'queued',notes:'upload'},false,true);assert.equal(initialUpload.wizardStep,'processing');assert.equal(initialUpload.inputTaskJob.id,'job');assert.equal(initialUpload.needsMappingRedirect,false);
const plainReopen=reopenPage({...job,status:'queued'},false);assert.equal(plainReopen.wizardStep,'mapping');assert.equal(plainReopen.needsMappingRedirect,true);assert.equal(plainReopen.inputTaskJob,undefined);
const xlsxReopen=reopenPage({...job,status:'queued'},false,true);assert.equal(xlsxReopen.needsMappingRedirect,true);assert.equal(xlsxReopen.inputTaskJob,undefined);
const {recentHref}=load(`export const recentHref=${expressions.recentJobHref}`,{isBatchMappingJob,isModernExcelImportJob:()=>true});
assert.equal(recentHref({...job,status:'queued'}),'/import-center?job=job&advanced=1#job-mapping');
assert.equal(recentHref({...job,status:'queued',notes:'upload'}),'/import-center?xlsxJob=job#source-upload');
assert(page.includes('if (needsMappingRedirect && requestedJob)'));
assert.equal(reopenPage({...job,status:'processing'}).wizardStep,'processing');
assert(page.includes('inputTaskJob && !inputTaskJob.finalImportStartedAt && (inputTaskJob.status === "queued" || inputTaskJob.status === "processing")'));
let redirectPath;
const actionSource=functions('src/app/actions.ts',['updateImportJobMappingAction','createImportValidationIssue','buildImportValidationMessage']);
const actions=load(actionSource,{...mapping,requireTenantSession:async()=>({user:{id:'user'},tenant:{id:'tenant'}}),getLocale:async()=> 'ja',isImportTargetEntity:()=>true,
 updateImportJobMapping:async input=>{assert(transition(job.status,input.status,false));job={...job,mappingJson:input.mappingJson,status:input.status,notes:input.notes??job.notes,validationMessage:input.validationMessage};return job;},
 addAuditLog:async record=>audit.push(record),revalidatePath:()=>{},withFlash:path=>path,redirect:path=>{redirectPath=path;throw new Error('fixture_redirect');}});
async function save(formRows){const form=new FormData();form.set('jobId','job');form.set('targetEntity','properties');for(const row of formRows){form.append('sourceColumn',row.source);form.append('targetField',row.target);}await assert.rejects(actions.updateImportJobMappingAction(form),/fixture_redirect/);}
await save(rows(job).map(row=>row.source==='所在地'?{...row,target:'area'}:row));
assert.equal(job.status,'queued');assert.equal(redirectPath,'/import-center?job=job&advanced=1');assert.equal(reopenPage(job).wizardStep,'mapping');assert.equal(job.notes,notes);assert.equal(audit.length,1);assert.equal(audit[0].action,'import_mapping_updated');assert.equal(audit[0].targetType,'task');
assert(JSON.parse(job.validationMessage).issues.some(issue=>issue.code==='missing_required_mapping'));
assert.equal(mapping.validateImportMapping('properties',job.mappingJson).missingRequired.join(','),'listing_price');
assert.equal(isBatchMappingJob(job),true);
assert.equal(JSON.stringify(rows(job)),JSON.stringify([{source:'物件名',target:'name'},{source:'所在地',target:'area'}]));
// A blank middle target must not shift the final target or reappear via autoMapping on reopen.
job={...job,status:'mapped',mappingJson:{},notes:JSON.stringify({...payload,headers:['物件名','所在地','価格,税込'],autoMapping:{'物件名':'name','所在地':'address','価格,税込':'listing_price'}})};
await save([{source:'物件名',target:'name'},{source:'所在地',target:''},{source:'価格,税込',target:'listing_price'}]);
assert.equal(job.status,'mapped');assert.equal(job.mappingJson['価格,税込'],'listing_price');assert(!Object.hasOwn(job.mappingJson,'所在地'));
assert.equal(JSON.stringify(rows(job)),JSON.stringify([{source:'物件名',target:'name'},{source:'所在地',target:''},{source:'価格,税込',target:'listing_price'}]));
console.log(JSON.stringify({pass:true,realActionAndHelpers:true,repository:'in_memory_fixture',cases:['real_two_headers_no_examples','malformed_payload_closed','queued_reopen_same_job','explicit_missing_focus_no_other_job','optional_save_queued_missing_price_audit_notes_preserved','blank_middle_no_shift_or_auto_restore','comma_header_preserved'],browserOrCloudEvidence:false}));
