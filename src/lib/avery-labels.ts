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
  /** Tags for filtering by project type (label, badge, certificate, card, etc.) */
  projectTypes?: string[];
  /** Whether bleed is enabled for this size */
  enableBleed?: boolean;
  /** Bleed amount in mm (typically 3mm) */
  bleedMm?: number;
}

// Map project types to search keywords for universal filtering
export const PROJECT_TYPE_KEYWORDS: Record<string, string[]> = {
  label: ['label', 'address', 'shipping', 'mailing', 'product', 'file', 'folder', 'return', 'sticker'],
  badge: ['badge', 'name', 'event', 'conference', 'trade show', 'id', 'pass', 'lanyard'],
  certificate: ['certificate', 'award', 'diploma', 'a4', 'letter', 'full page', 'document'],
  card: ['card', 'business', 'greeting', 'invitation', 'postcard', 'mini'],
  shelf_strip: ['shelf', 'strip', 'retail', 'pricing', 'tag', 'inventory'],
  custom: [], // matches all
};

// Common field patterns for auto-detection across all project types
export const COMMON_FIELD_PATTERNS: Record<string, string[]> = {
  // Person fields
  name: ['name', 'full_name', 'fullname', 'person', 'attendee', 'participant', 'guest'],
  first_name: ['first_name', 'firstname', 'given_name', 'givenname', 'first'],
  last_name: ['last_name', 'lastname', 'surname', 'family_name', 'familyname', 'last'],
  title: ['title', 'job_title', 'jobtitle', 'position', 'role', 'designation'],
  company: ['company', 'organization', 'org', 'employer', 'business', 'firm', 'corporation'],
  department: ['department', 'dept', 'division', 'team', 'unit', 'group'],
  
  // Contact fields
  email: ['email', 'e-mail', 'mail', 'email_address'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'contact'],
  
  // Address fields
  address: ['address', 'street', 'address_line', 'addr', 'location'],
  city: ['city', 'town', 'municipality', 'locality'],
  state: ['state', 'province', 'region', 'county'],
  zip: ['zip', 'postal', 'postcode', 'zip_code', 'postal_code'],
  country: ['country', 'nation'],
  
  // Image fields - CRITICAL for VDP
  photo: ['photo', 'image', 'picture', 'avatar', 'headshot', 'portrait', 'logo', 'icon', 'img', 'pic', 'thumbnail'],
  
  // Product fields
  product: ['product', 'item', 'sku', 'article', 'merchandise'],
  price: ['price', 'cost', 'amount', 'value', 'rate'],
  barcode: ['barcode', 'upc', 'ean', 'code', 'serial'],
  
  // Event fields
  event: ['event', 'conference', 'meeting', 'seminar', 'workshop'],
  date: ['date', 'day', 'when', 'schedule'],
  time: ['time', 'hour', 'start', 'end'],
};

/** Detect if a column name likely contains image references */
export function isLikelyImageField(columnName: string): boolean {
  const lower = columnName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return COMMON_FIELD_PATTERNS.photo.some(pattern => 
    lower.includes(pattern.replace(/[^a-z0-9]/g, ''))
  );
}

/** Common image file extensions */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];

/** Detect if a cell value looks like an image path or filename */
export function isLikelyImageValue(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  
  const lower = value.toLowerCase().trim();
  
  // Check for image file extensions
  if (IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) return true;
  
  // Check for file paths (Windows or Unix)
  if (lower.includes('\\') || lower.startsWith('/')) {
    // Contains path separators - check if ends with image extension
    return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
  }
  
  // Check for URLs pointing to images
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return IMAGE_EXTENSIONS.some(ext => lower.includes(ext));
  }
  
  return false;
}

/** Detect which columns contain image values by scanning sample data */
export function detectImageColumnsFromValues(
  columns: string[],
  sampleRows: Record<string, any>[]
): string[] {
  const imageColumns: string[] = [];
  
  for (const col of columns) {
    // First check by column name
    if (isLikelyImageField(col)) {
      imageColumns.push(col);
      continue;
    }
    
    // Then check by scanning values
    let imageValueCount = 0;
    const rowsToCheck = sampleRows.slice(0, 5); // Check first 5 rows
    
    for (const row of rowsToCheck) {
      if (isLikelyImageValue(row[col])) {
        imageValueCount++;
      }
    }
    
    // If more than half the sample rows have image-like values, it's an image column
    if (imageValueCount > 0 && imageValueCount >= rowsToCheck.length / 2) {
      imageColumns.push(col);
    }
  }
  
  return imageColumns;
}

/** Get suggested field type based on column name */
export function detectFieldType(columnName: string): string | null {
  const lower = columnName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [fieldType, patterns] of Object.entries(COMMON_FIELD_PATTERNS)) {
    if (patterns.some(p => lower.includes(p.replace(/[^a-z0-9]/g, '')))) {
      return fieldType;
    }
  }
  return null;
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
    useCase: "Certificates, flyers, documents",
    projectTypes: ["certificate", "custom"]
  },
  {
    id: "letter-full",
    name: "Letter Full Page",
    width_mm: 215.9,
    height_mm: 279.4,
    category: "standard",
    description: "US Letter paper size",
    useCase: "Certificates, flyers, documents",
    projectTypes: ["certificate", "custom"]
  },
  {
    id: "a5",
    name: "A5",
    width_mm: 148,
    height_mm: 210,
    category: "standard",
    description: "Half of A4",
    useCase: "Booklets, cards, invitations",
    projectTypes: ["card", "certificate", "custom"]
  },
  {
    id: "a6",
    name: "A6 Postcard",
    width_mm: 105,
    height_mm: 148,
    category: "standard",
    description: "Postcard size",
    useCase: "Postcards, greeting cards",
    projectTypes: ["card", "custom"]
  },
  {
    id: "business-card",
    name: "Business Card",
    width_mm: 85.6,
    height_mm: 53.98,
    category: "standard",
    description: "Standard business card",
    useCase: "Business cards, mini cards",
    projectTypes: ["card", "badge", "custom"]
  },
  {
    id: "name-badge-standard",
    name: "Name Badge (Standard)",
    width_mm: 89,
    height_mm: 57,
    category: "standard",
    description: "Standard name badge size",
    useCase: "Events, conferences, meetings",
    projectTypes: ["badge", "custom"]
  },
  {
    id: "name-badge-large",
    name: "Name Badge (Large)",
    width_mm: 100,
    height_mm: 70,
    category: "standard",
    description: "Large name badge with photo space",
    useCase: "Trade shows, corporate events",
    projectTypes: ["badge", "custom"]
  },
  {
    id: "lanyard-badge",
    name: "Lanyard Badge",
    width_mm: 86,
    height_mm: 114,
    category: "standard",
    description: "Vertical lanyard badge holder",
    useCase: "Conferences, access passes",
    projectTypes: ["badge", "custom"]
  },
  {
    id: "custom",
    name: "Custom Size",
    width_mm: 100,
    height_mm: 100,
    category: "custom",
    description: "Define your own dimensions",
    useCase: "Any custom project",
    projectTypes: ["label", "badge", "certificate", "card", "shelf_strip", "custom"]
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

/** Filter templates by project type using keywords and projectTypes tags */
export const getTemplatesByProjectType = (projectType: string): LabelSize[] => {
  const keywords = PROJECT_TYPE_KEYWORDS[projectType] || [];
  if (keywords.length === 0) return getAllTemplates(); // 'custom' matches all
  
  return getAllTemplates().filter(template => {
    // Check explicit projectTypes tag
    if (template.projectTypes?.includes(projectType)) return true;
    
    // Check useCase and description for keywords
    const searchText = `${template.useCase || ''} ${template.description || ''} ${template.name}`.toLowerCase();
    return keywords.some(keyword => searchText.includes(keyword));
  });
};

/** Get suggested templates for a project type, sorted by relevance */
export const getSuggestedTemplates = (projectType: string): LabelSize[] => {
  const templates = getTemplatesByProjectType(projectType);
  
  // Sort: explicit projectTypes match first, then by labelsPerSheet (higher = more common use)
  return templates.sort((a, b) => {
    const aExplicit = a.projectTypes?.includes(projectType) ? 1 : 0;
    const bExplicit = b.projectTypes?.includes(projectType) ? 1 : 0;
    if (aExplicit !== bExplicit) return bExplicit - aExplicit;
    return (b.labelsPerSheet || 0) - (a.labelsPerSheet || 0);
  });
};
