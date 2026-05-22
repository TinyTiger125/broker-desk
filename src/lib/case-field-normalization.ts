export const CASE_FIELD_ALIASES: Record<string, string[]> = {
  "property.name": ["property.name", "property_name", "building_name"],
  "property.address": ["property.address", "property_location", "residential_address", "building_location"],
  "property.roomNumber": ["property.roomNumber", "room_number", "unit_number"],
  "lease.moveInDate": ["lease.moveInDate", "move_in_date", "move_in_planned_date"],
  "lease.rent": ["lease.rent", "rent", "monthly_rent"],
  "lease.commonFee": ["lease.commonFee", "common_fee", "management_fee"],
  "lease.parkingFee": ["lease.parkingFee", "parking_fee"],
  "lease.monthlyRentTotal": ["lease.monthlyRentTotal", "monthly_rent_total", "rent_total"],
  "lease.deposit": ["lease.deposit"],
  "lease.keyMoney": ["lease.keyMoney", "key_money"],
  "applicant.name": ["applicant.name", "buyer_name", "tenant_name"],
  "applicant.furigana": ["applicant.furigana", "buyer_furigana", "tenant_furigana"],
  "applicant.gender": ["applicant.gender", "tenant_gender"],
  "applicant.spouse": ["applicant.spouse", "tenant_spouse"],
  "applicant.birthDate": ["applicant.birthDate", "buyer_birth_date", "tenant_birth_date"],
  "applicant.phone": ["applicant.phone", "buyer_phone", "tenant_phone", "mobile_phone"],
  "applicant.email": ["applicant.email", "buyer_email", "tenant_email"],
  "applicant.currentAddress": ["applicant.currentAddress", "buyer_address", "tenant_address"],
  "applicant.nationality": ["applicant.nationality", "nationality"],
  "applicant.identityDocumentType": ["applicant.identityDocumentType", "identity_document_type"],
  "applicant.residenceStatus": ["applicant.residenceStatus", "residence_status"],
  "applicant.residencePeriod": ["applicant.residencePeriod", "residence_period"],
  "applicant.residenceCardExpiry": ["applicant.residenceCardExpiry", "residence_card_expiry"],
  "applicant.residenceCardNumber": ["applicant.residenceCardNumber", "residence_card_number"],
  "applicant.workRestriction": ["applicant.workRestriction", "work_restriction"],
  "applicant.driverLicenseNumber": ["applicant.driverLicenseNumber", "driver_license_number"],
  "applicant.driverLicenseExpiry": ["applicant.driverLicenseExpiry", "driver_license_expiry"],
  "applicant.driverLicenseConditions": ["applicant.driverLicenseConditions", "driver_license_conditions"],
  "applicant.employerName": ["applicant.employerName", "employer_name", "workplace_name"],
  "applicant.employerPhone": ["applicant.employerPhone", "employer_phone", "workplace_phone"],
  "applicant.occupation": ["applicant.occupation", "occupation"],
  "applicant.jobType": ["applicant.jobType", "job_type"],
  "applicant.employmentType": ["applicant.employmentType", "employment_type"],
  "applicant.annualIncome": ["applicant.annualIncome", "annual_income"],
  "applicant.yearsEmployed": ["applicant.yearsEmployed", "years_employed"],
  "applicant.moveReason": ["applicant.moveReason", "move_reason"],
  "guarantor.gender": ["guarantor.gender"],
  "guarantor.spouse": ["guarantor.spouse"],
  "guarantor.jobType": ["guarantor.jobType"],
  "guarantor.employmentType": ["guarantor.employmentType"],
  "emergencyContact.name": ["emergencyContact.name", "guarantor_name", "emergency_contact_name"],
  "emergencyContact.gender": ["emergencyContact.gender"],
  "emergencyContact.spouse": ["emergencyContact.spouse"],
  "emergencyContact.relationship": ["emergencyContact.relationship", "guarantor_relationship", "emergency_contact_relationship"],
  "emergencyContact.phone": ["emergencyContact.phone", "guarantor_phone", "emergency_contact_phone"],
  "emergencyContact.address": ["emergencyContact.address", "guarantor_address", "emergency_contact_address"],
  "emergencyContact.employerName": ["emergencyContact.employerName", "guarantor_employer_name"],
  "emergencyContact.jobType": ["emergencyContact.jobType"],
  "emergencyContact.employmentType": ["emergencyContact.employmentType"],
  "broker.companyName": ["broker.companyName", "broker_a_company_name", "broker_b_company_name"],
  "broker.staffName": ["broker.staffName", "agent_a_name", "agent_b_name"],
  "broker.phone": ["broker.phone", "broker_a_phone", "broker_b_phone"],
  "management.companyName": ["management.companyName", "management_company_name"],
  "management.phone": ["management.phone", "management_phone"],
  "guarantee.plan": ["guarantee.plan", "guarantee_plan"],
};

const ALIAS_TO_CANONICAL = Object.entries(CASE_FIELD_ALIASES).reduce<Record<string, string>>((acc, [canonical, aliases]) => {
  aliases.forEach((alias) => {
    acc[alias] = canonical;
  });
  return acc;
}, {});

export function canonicalizeCaseFieldKey(fieldKey: string): string {
  return ALIAS_TO_CANONICAL[fieldKey] ?? fieldKey;
}

export function getCaseFieldAliases(canonicalFieldKey: string): string[] {
  return CASE_FIELD_ALIASES[canonicalFieldKey] ?? [canonicalFieldKey];
}

export function getCaseFieldValue(confirmedData: Record<string, unknown>, canonicalFieldKey: string): string {
  for (const alias of getCaseFieldAliases(canonicalFieldKey)) {
    const value = confirmedData[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function clearCaseFieldValueAliases(confirmedData: Record<string, unknown>, canonicalFieldKey: string) {
  getCaseFieldAliases(canonicalFieldKey).forEach((alias) => {
    delete confirmedData[alias];
  });
}
