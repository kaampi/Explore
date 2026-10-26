export type AnatomyImage = { src: string; label: string };
/** Image paths are served from public/anatomy; add more galleries by template ID. */
export const anatomyImages: Record<string, AnatomyImage[]> = {
  "builtin-humanoid": [
    { src: "/anatomy/humanoid_male.png", label: "Human Male" },
    { src: "/anatomy/humanoid_female.png", label: "Human Female" },
    { src: "/anatomy/humanoid_elf_male.png", label: "Elf Male" },
    { src: "/anatomy/humanoid_elf_female.png", label: "Elf Female" },
    { src: "/anatomy/humanoid_orc.png", label: "Orc" },
    { src: "/anatomy/humanoid_dwarf.png", label: "Dwarf" }
  ]
};
