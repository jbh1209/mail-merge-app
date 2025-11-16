// Avery label database with popular label sizes and standard print formats
export interface LabelSize {
  id: string;
  name: string;
  averyCode?: string;
  width_mm: number;
  height_mm: number;
  labelsPerSheet?: number;
  category: "avery" | "standard" | "custom";
  description?: string;
  useCase?: string;
}

export const AVERY_LABELS: LabelSize[] = [
  // Popular Avery Address Labels
  {
    id: "avery-5160",
    name: "Address Labels (1\" x 2-5/8\")",
    averyCode: "5160",
    width_mm: 66.68,
    height_mm: 25.4,
    labelsPerSheet: 30,
    category: "avery",
    description: "Most popular address label",
    useCase: "Mailing, addressing"
  },
  {
    id: "avery-5161",
    name: "Address Labels (1\" x 4\")",
    averyCode: "5161",
    width_mm: 101.6,
    height_mm: 25.4,
    labelsPerSheet: 20,
    category: "avery",
    description: "Large address labels",
    useCase: "Shipping, mailing"
  },
  {
    id: "avery-5163",
    name: "Shipping Labels (2\" x 4\")",
    averyCode: "5163",
    width_mm: 101.6,
    height_mm: 50.8,
    labelsPerSheet: 10,
    category: "avery",
    description: "Full shipping labels",
    useCase: "Packages, large envelopes"
  },
  {
    id: "avery-5164",
    name: "Shipping Labels (3-1/3\" x 4\")",
    averyCode: "5164",
    width_mm: 101.6,
    height_mm: 84.67,
    labelsPerSheet: 6,
    category: "avery",
    description: "Extra large shipping",
    useCase: "Large packages"
  },

  // Name Badges
  {
    id: "avery-5395",
    name: "Name Badge Labels (2-1/3\" x 3-3/8\")",
    averyCode: "5395",
    width_mm: 85.73,
    height_mm: 59.27,
    labelsPerSheet: 8,
    category: "avery",
    description: "Name badge inserts",
    useCase: "Events, conferences"
  },
  {
    id: "avery-5390",
    name: "Name Badge Labels (3\" x 4\")",
    averyCode: "5390",
    width_mm: 101.6,
    height_mm: 76.2,
    labelsPerSheet: 6,
    category: "avery",
    description: "Large name badges",
    useCase: "Trade shows, events"
  },

  // Product Labels
  {
    id: "avery-5294",
    name: "Round Labels (2-1/2\" diameter)",
    averyCode: "5294",
    width_mm: 63.5,
    height_mm: 63.5,
    labelsPerSheet: 9,
    category: "avery",
    description: "Round product labels",
    useCase: "Jars, containers, products"
  },
  {
    id: "avery-5167",
    name: "Return Address Labels (1/2\" x 1-3/4\")",
    averyCode: "5167",
    width_mm: 44.45,
    height_mm: 12.7,
    labelsPerSheet: 80,
    category: "avery",
    description: "Small return address",
    useCase: "Envelopes, correspondence"
  },

  // File Folder Labels
  {
    id: "avery-5366",
    name: "File Folder Labels (2/3\" x 3-7/16\")",
    averyCode: "5366",
    width_mm: 87.31,
    height_mm: 16.93,
    labelsPerSheet: 30,
    category: "avery",
    description: "File folder labels",
    useCase: "Filing, organization"
  },

  // CD/DVD Labels
  {
    id: "avery-5692",
    name: "CD/DVD Labels (4-5/8\" diameter)",
    averyCode: "5692",
    width_mm: 117.48,
    height_mm: 117.48,
    labelsPerSheet: 2,
    category: "avery",
    description: "Full-face CD/DVD labels",
    useCase: "Media, archives"
  }
];

export const STANDARD_SIZES: LabelSize[] = [
  {
    id: "a4-full",
    name: "A4 Full Page",
    width_mm: 210,
    height_mm: 297,
    category: "standard",
    description: "Standard A4 paper size",
    useCase: "Certificates, flyers, documents"
  },
  {
    id: "letter-full",
    name: "Letter Full Page",
    width_mm: 215.9,
    height_mm: 279.4,
    category: "standard",
    description: "US Letter paper size",
    useCase: "Certificates, flyers, documents"
  },
  {
    id: "a5",
    name: "A5",
    width_mm: 148,
    height_mm: 210,
    category: "standard",
    description: "Half of A4",
    useCase: "Booklets, cards, invitations"
  },
  {
    id: "a6",
    name: "A6 Postcard",
    width_mm: 105,
    height_mm: 148,
    category: "standard",
    description: "Postcard size",
    useCase: "Postcards, greeting cards"
  },
  {
    id: "business-card",
    name: "Business Card",
    width_mm: 85.6,
    height_mm: 53.98,
    category: "standard",
    description: "Standard business card",
    useCase: "Business cards, mini cards"
  },
  {
    id: "custom",
    name: "Custom Size",
    width_mm: 100,
    height_mm: 100,
    category: "custom",
    description: "Define your own dimensions",
    useCase: "Any custom project"
  }
];

export const getAllTemplates = (): LabelSize[] => {
  return [...AVERY_LABELS, ...STANDARD_SIZES];
};

export const getTemplateById = (id: string): LabelSize | undefined => {
  return getAllTemplates().find(t => t.id === id);
};

export const getTemplatesByCategory = (category: "avery" | "standard" | "custom"): LabelSize[] => {
  return getAllTemplates().filter(t => t.category === category);
};
