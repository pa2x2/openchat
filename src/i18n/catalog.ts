export type PluralForm = "zero" | "one" | "two" | "few" | "many" | "other";

type Plain<T, Forms extends PluralForm> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : Catalog<T, Forms>;

/**
 * The shape another language's catalog must have, given the English one:
 * the same keys, except that each plural (`key_one` + `key_other` in
 * English) takes exactly the forms the language's plural rules pick from.
 * A form left out would not fall back to the language's own `key_other`:
 * i18next would show the English string instead.
 */
export type Catalog<T, Forms extends PluralForm> = {
  [K in keyof T as K extends `${string}_${PluralForm}` ? never : K]: Plain<T[K], Forms>;
} & {
  [K in keyof T as K extends `${infer Base}_other` ? `${Base}_${Forms}` : never]: string;
};
