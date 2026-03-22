const compactLineWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const KNOWN_TOKEN_CASE: Record<string, string> = {
  dni: 'DNI',
  ruc: 'RUC',
  ce: 'CE',
  imei: 'IMEI',
  ram: 'RAM',
  rom: 'ROM',
  gb: 'GB',
  tb: 'TB',
  sim: 'SIM',
  esim: 'eSIM',
  usb: 'USB',
  nfc: 'NFC',
  gps: 'GPS',
  led: 'LED',
  oled: 'OLED',
  lcd: 'LCD',
  bcp: 'BCP',
  bbva: 'BBVA',
  yape: 'Yape',
  plin: 'Plin',
  '5g': '5G',
  '4g': '4G',
  '3g': '3G'
};

const normalizeLines = (value: string | null | undefined): string[] =>
  String(value ?? '')
    .split(/\r?\n/)
    .map(compactLineWhitespace)
    .filter(Boolean);

const capitalizeFirstLetter = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

const applyKnownTokenCase = (value: string): string =>
  value
    .replace(/[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, (word) => KNOWN_TOKEN_CASE[word.toLowerCase()] || word)
    .replace(/(\d+)\s*gb\b/gi, '$1GB')
    .replace(/(\d+)\s*tb\b/gi, '$1TB');

const titleCaseLine = (line: string): string =>
  applyKnownTokenCase(
    compactLineWhitespace(line)
      .toLowerCase()
      .replace(/[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, (word) => capitalizeFirstLetter(word))
  );

const sentenceCaseLine = (line: string): string => {
  const normalized = compactLineWhitespace(line).toLowerCase();
  return applyKnownTokenCase(capitalizeFirstLetter(normalized));
};

const transformNullable = (
  value: string | null | undefined,
  formatter: (line: string) => string
): string | null => {
  const lines = normalizeLines(value);
  if (lines.length === 0) return null;
  return lines.map(formatter).join('\n');
};

export const toTitleCase = (value: string | null | undefined): string =>
  transformNullable(value, titleCaseLine) || '';

export const toSentenceCase = (value: string | null | undefined): string =>
  transformNullable(value, sentenceCaseLine) || '';

export const toNullableTitleCase = (value: string | null | undefined): string | null =>
  transformNullable(value, titleCaseLine);

export const toNullableSentenceCase = (value: string | null | undefined): string | null =>
  transformNullable(value, sentenceCaseLine);
