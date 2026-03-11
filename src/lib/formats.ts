export type FormatOption = {
  id: string;
  label: string;
};

export const formatOptions: FormatOption[] = [
  { id: "SVI-ASC", label: "SVI-ASC" },
  { id: "SVI-PFL", label: "SVI-PFL" },
  { id: "SVI-MEG", label: "SVI-MEG" },
  { id: "SVI-WHT/BLK", label: "SVI-WHT/BLK" },
  { id: "SVI-DRI", label: "SVI-DRI" },
  { id: "SVI-JTG", label: "SVI-JTG" },
  { id: "BRS-PRE", label: "BRS-PRE" },
  { id: "BRS-SSP", label: "BRS-SSP" }
];

export function findFormatById(id: string): FormatOption | undefined {
  return formatOptions.find((option) => option.id === id);
}
