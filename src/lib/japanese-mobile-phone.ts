const JAPANESE_MOBILE_PREFIXES = ["060", "070", "080", "090"] as const;

// Japanese fixed-line area codes have variable lengths. The explicit prefixes
// below cover the nationwide 3-digit families and the common 4/5-digit local
// families; unknown 10-digit numbers remain invalid instead of receiving a
// guessed split.
const JAPANESE_LANDLINE_AREA_CODE_LENGTHS: ReadonlyArray<[string, number]> = [
  ["03", 2], ["06", 2],
  ...[
    "011", "012", "013", "014", "015", "016", "017", "018", "019",
    "022", "023", "024", "025", "026", "027", "028", "029",
    "042", "043", "044", "045", "046", "047", "048", "049",
    "052", "053", "054", "055", "056", "057", "058", "059",
    "072", "073", "075", "076", "077", "078", "079",
    "082", "083", "084", "085", "086", "087", "088", "089",
    "092", "093", "094", "095", "096", "097", "098", "099",
  ].map((prefix) => [prefix, 3] as [string, number]),
  ...[
    "0133", "0134", "0135", "0136", "0137", "0138", "0139",
    "0142", "0143", "0144", "0145", "0146", "0147", "0148", "0149",
    "0152", "0153", "0154", "0155", "0156", "0157", "0158", "0159",
    "0162", "0163", "0164", "0165", "0166", "0167", "0168", "0169",
    "0172", "0173", "0174", "0175", "0176", "0177", "0178", "0179",
    "0182", "0183", "0184", "0185", "0186", "0187", "0188", "0189",
    "0191", "0192", "0193", "0194", "0195", "0196", "0197", "0198",
    "0220", "0222", "0223", "0224", "0225", "0226", "0228", "0229",
    "0233", "0234", "0235", "0236", "0237", "0238", "0239",
    "0240", "0241", "0242", "0243", "0244", "0246", "0247", "0248", "0249",
    "0250", "0254", "0255", "0256", "0257", "0258", "0259",
    "0260", "0261", "0263", "0264", "0265", "0266", "0267", "0268", "0269",
    "0270", "0274", "0276", "0277", "0278", "0279",
    "0280", "0282", "0283", "0284", "0285", "0287", "0288", "0289",
    "0291", "0292", "0293", "0294", "0295", "0296", "0297", "0299",
    "0422", "0428", "0429", "0436", "0438", "0439", "0445", "0446", "0447", "0448", "0449",
    "0460", "0463", "0465", "0466", "0467", "0468", "0469", "0470", "0475", "0476", "0478", "0479",
    "0480", "0489", "0493", "0494", "0495", "0498", "0499",
    "0531", "0532", "0533", "0536", "0537", "0538", "0539", "0544", "0545", "0546", "0547", "0548", "0549",
    "0550", "0551", "0553", "0554", "0555", "0556", "0557", "0558", "0559",
    "0561", "0562", "0563", "0564", "0565", "0566", "0567", "0568", "0569",
    "0572", "0573", "0574", "0575", "0576", "0577", "0578", "0579",
    "0581", "0584", "0585", "0586", "0587", "0588", "0589",
    "0594", "0595", "0596", "0597", "0598", "0599",
    "0721", "0725", "0726", "0727", "0728", "0729", "0731", "0733", "0735", "0736", "0737", "0738", "0739",
    "0740", "0742", "0743", "0744", "0745", "0746", "0747", "0748", "0749",
    "0750", "0755", "0756", "0757", "0758", "0759", "0761", "0763", "0765", "0766", "0767", "0768", "0769",
    "0770", "0771", "0772", "0773", "0774", "0776", "0778", "0779",
    "0790", "0791", "0794", "0795", "0796", "0797", "0798", "0799",
    "0820", "0823", "0824", "0826", "0827", "0829", "0833", "0834", "0835", "0836", "0837", "0838", "0839",
    "0845", "0846", "0847", "0848", "0849", "0852", "0853", "0854", "0855", "0856", "0857", "0858", "0859",
    "0863", "0865", "0866", "0867", "0868", "0869", "0875", "0877", "0879",
    "0880", "0883", "0884", "0885", "0887", "0889", "0892", "0893", "0894", "0895", "0896", "0897", "0898", "0899",
    // Fukuoka city uses the three-digit 092 area code; do not add broad
    // 092x prefixes here or valid 092-3-4 numbers would be split incorrectly.
    "0930", "0932", "0933", "0934", "0935", "0936", "0937", "0938", "0939",
    "0940", "0942", "0943", "0944", "0946", "0947", "0948", "0949", "0952", "0954", "0955", "0956", "0957", "0959",
    "0962", "0964", "0965", "0966", "0967", "0968", "0969", "0972", "0973", "0974", "0977", "0978", "0979",
    "0980", "0982", "0983", "0984", "0985", "0986", "0987", "0988", "0989", "0993", "0994", "0995", "0996", "0997", "09969",
  ].map((prefix) => [prefix, prefix.length] as [string, number]),
];

/** Normalize user-entered digits without silently truncating invalid input. */
export function normalizeJapanesePhone(value: string): string {
  return value.normalize("NFKC").replace(/[()\-\sー‐‑–—]/gu, "");
}

/** Backward-compatible alias retained for callers that only handled mobile numbers. */
export const normalizeJapaneseMobilePhone = normalizeJapanesePhone;

export function isJapaneseMobilePhone(value: string): boolean {
  const digits = normalizeJapanesePhone(value);
  return /^\d{11}$/.test(digits) && JAPANESE_MOBILE_PREFIXES.some((prefix) => digits.startsWith(prefix));
}

function areaCodeLengthFor(value: string): number | null {
  return [...JAPANESE_LANDLINE_AREA_CODE_LENGTHS]
    .sort((left, right) => right[0].length - left[0].length)
    .find(([prefix]) => value.startsWith(prefix))?.[1] ?? null;
}

export function japanesePhoneParts(value: string): [string, string, string] | null {
  const digits = normalizeJapanesePhone(value);
  if (isJapaneseMobilePhone(digits)) return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  if (!/^\d{10}$/.test(digits)) return null;
  const areaCodeLength = areaCodeLengthFor(digits);
  if (!areaCodeLength) return null;
  const subscriber = digits.slice(areaCodeLength);
  const subscriberParts = areaCodeLength === 2 ? [subscriber.slice(0, 4), subscriber.slice(4)]
    : areaCodeLength === 3 ? [subscriber.slice(0, 3), subscriber.slice(3)]
      : areaCodeLength === 4 ? [subscriber.slice(0, 2), subscriber.slice(2)]
        : [subscriber.slice(0, 1), subscriber.slice(1)];
  return [digits.slice(0, areaCodeLength), subscriberParts[0], subscriberParts[1]];
}

export function isJapaneseLandlinePhone(value: string): boolean {
  const digits = normalizeJapanesePhone(value);
  return japanesePhoneParts(digits) !== null && !isJapaneseMobilePhone(digits);
}

export function isJapanesePhone(value: string): boolean {
  return isJapaneseMobilePhone(value) || isJapaneseLandlinePhone(value);
}

/**
 * Existing records may contain a pre-validation, non-Japanese contact value.
 * Editing an unrelated field must not rewrite or reject that legacy value;
 * changing the contact itself still goes through the Japanese format rule.
 */
export function isUnchangedLegacyPhone(value: string, authoritativeValue?: string): boolean {
  const submitted = value.trim();
  const authoritative = authoritativeValue?.trim() ?? "";
  return Boolean(submitted && authoritative && submitted === authoritative && !isJapanesePhone(submitted));
}

export function formatJapanesePhone(value: string): string {
  const digits = normalizeJapanesePhone(value);
  if (!digits) return "";
  const parts = japanesePhoneParts(digits);
  if (parts) return parts.filter(Boolean).join("-");
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/**
 * Format an existing stored value only when it is a valid Japanese phone.
 * Legacy non-Japanese values must remain byte-for-byte unchanged until the
 * user edits that field, so the general typing formatter is not appropriate
 * for server-provided defaults.
 */
export function formatJapanesePhoneForDisplay(value: string): string {
  return isJapanesePhone(value) ? formatJapanesePhone(value) : value;
}

/** Backward-compatible formatter for existing mobile-only callers. */
export const formatJapaneseMobilePhone = formatJapanesePhone;
