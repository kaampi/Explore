import type { AnatomyTemplate } from "@state/StateSchema";

type Capability = AnatomyTemplate["parts"][number]["capabilities"][number];
type Part = AnatomyTemplate["parts"][number];

const makePart = (id: string, capabilities: Capability[] = []): Part => ({
  id, label: id.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), capabilities
});

const build = (id: string, name: string, groups: Record<string, string>, capabilities: Record<string, Capability[]> = {}): AnatomyTemplate => ({
  id: `builtin-${id}`, name, version: 1,
  parts: Object.entries(groups).flatMap(([group, ids]) =>
    ids.split(",").map((value) => value.trim()).filter(Boolean).map((partId) => ({
      ...makePart(partId, capabilities[partId] ?? []), group
    }))
  )
});

const limbs = { head: ["sense"], left_hand: ["grasp", "manipulate", "sense"], right_hand: ["grasp", "manipulate", "sense"], left_foot: ["support", "locomote"], right_foot: ["support", "locomote"] } as Record<string, Capability[]>;

export const BUILTIN_ANATOMY_TEMPLATES: AnatomyTemplate[] = [
  build("humanoid", "Humanoid", { "Head & Neck": "head, neck, left_eye, right_eye, mouth, left_ear, right_ear", "Torso": "chest, abdomen, pelvis", "Arms & Hands": "left_arm, right_arm, left_hand, right_hand", "Legs & Feet": "left_leg, right_leg, left_foot, right_foot" }, limbs),
  build("equine", "Equine", { "Head & Neck": "head, muzzle, ears, eyes, neck", "Body": "chest, torso, abdomen", "Front Legs": "front_left_leg, front_right_leg, front_left_hoof, front_right_hoof", "Hind Legs": "hind_left_leg, hind_right_leg, hind_left_hoof, hind_right_hoof", "Tail": "tail" }),
  build("quadruped", "Quadruped", { "Head & Neck": "head, muzzle, ears, eyes, mouth, neck", "Body": "chest, torso, abdomen", "Front Legs": "front_left_leg, front_right_leg, front_left_paw, front_right_paw", "Hind Legs": "hind_left_leg, hind_right_leg, hind_left_paw, hind_right_paw", "Tail": "tail" }),
  build("serpentine", "Serpentine", { "Head": "head, eyes, mouth, tongue, fangs", "Body": "neck, torso, belly, scales", "Tail": "tail, tail_tip" }),
  build("arachnid", "Arachnid", { "Cephalothorax": "cephalothorax, eyes, chelicerae, left_pedipalp, right_pedipalp", "Abdomen": "abdomen, spinnerets", "Legs": "leg_1, leg_2, leg_3, leg_4, leg_5, leg_6, leg_7, leg_8" }),
  build("avian", "Avian", { "Head": "head, beak, eyes, neck", "Torso": "chest, torso", "Wings": "left_wing, right_wing", "Legs": "left_leg, right_leg, left_foot, right_foot, talons", "Tail": "tail_feathers" }),
  build("reptilian", "Reptilian", { "Head": "head, eyes, mouth, jaw, neck", "Torso": "chest, torso, abdomen", "Limbs": "front_left_leg, front_right_leg, back_left_leg, back_right_leg, claws", "Tail": "tail" }),
  build("cephalopod", "Cephalopod", { "Head & Mantle": "head, mantle, eyes, mouth, siphon", "Arms & Tentacles": "arm_1, arm_2, arm_3, arm_4, arm_5, arm_6, arm_7, arm_8, suckers" }),
  build("dragon", "Dragon", { "Head & Neck": "head, eyes, jaws, horns, neck", "Torso": "chest, torso, abdomen", "Legs": "front_left_leg, front_right_leg, back_left_leg, back_right_leg, claws", "Wings": "left_wing, right_wing", "Tail": "tail, tail_tip" }),
  build("centauroid", "Centauroid", { "Humanoid Upper Body": "head, neck, human_torso, left_arm, right_arm, left_hand, right_hand", "Equine Body": "equine_torso, abdomen", "Legs": "front_left_leg, front_right_leg, hind_left_leg, hind_right_leg, hooves", "Tail": "tail" }),
  build("insectoid", "Insectoid", { "Head": "head, eyes, antennae, mandibles", "Thorax": "thorax", "Abdomen": "abdomen", "Legs": "leg_1, leg_2, leg_3, leg_4, leg_5, leg_6", "Wings": "left_wing, right_wing" })
];

export const isBuiltInAnatomy = (id: string) => id.startsWith("builtin-");
