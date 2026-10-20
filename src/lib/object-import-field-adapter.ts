export function toObjectRecordFieldKey(targetType: "party" | "property", fieldKey: string): string {
  const key = fieldKey.includes(".") ? fieldKey.split(".").at(-1) ?? fieldKey : fieldKey;
  return targetType === "property" && ["listing_price", "listingPrice"].includes(key) ? "listingPrice" : key;
}
