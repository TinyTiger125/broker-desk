/** Synthetic reader output for the isolated local acceptance runtime only. */
export function localPropertyReaderFixture(buffer: Buffer, filename: string) {
  if (process.env.NODE_ENV === "production"
    || process.env.BROKER_DESK_LOCAL_RUNTIME !== "1"
    || process.env.BROKER_DESK_READER_FIXTURE !== "report1120"
    || !/^report1120-synthetic-[ab]\.pdf$/.test(filename)
    || !buffer.toString("utf8").includes("BROKER_DESK_REPORT1120_SYNTHETIC")) return null;
  const second = filename.endsWith("-b.pdf");
  return [
    { fieldKey: "property.name", value: "架空テストマンション", uncertainty: "clear" as const, pageNumber: 1, sourceText: "物件名 架空テストマンション" },
    { fieldKey: "property.sizeSqm", value: second ? "26.3" : "23.47", uncertainty: "clear" as const, pageNumber: 3, sourceText: `専有面積 ${second ? "26.3" : "23.47"}㎡` },
    ...(!second ? [{ fieldKey: "property.postalCode", value: "8130017", uncertainty: "clear" as const, pageNumber: 2, sourceText: "郵便番号 8130017" }] : []),
  ];
}
