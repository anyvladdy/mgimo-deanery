const rules = new Intl.PluralRules('ru');
const formIndex = { one: 0, few: 1, many: 2, other: 2 };

// Русская форма числительного: 1 дисциплина, 2 дисциплины, 5 дисциплин.
export function pluralRu(count, one, few, many) {
  return [one, few, many][formIndex[rules.select(count)] ?? 2];
}
