interface Labelable {
  name: string;
  isUnique: boolean;
  qty: number;
  serialNumber?: string;
}

/** "Raspberry Pi 5 [SN: EQ-001-451]" for unique units, "Breadboard (เหมา 5 ชิ้น)" for bulk. */
export function itemLabel({ name, isUnique, qty, serialNumber }: Labelable): string {
  if (isUnique) return serialNumber ? `${name} [SN: ${serialNumber}]` : name;
  return `${name} (เหมา ${qty} ชิ้น)`;
}
