/**
 * Thin entity definitions — labels and match rules only.
 * Field lists, D03 paths, and use cases always come from the generated catalog.
 */

export interface EntityDef {
  id: string;
  title: string;
  summary: string;
  /** How the platform composes this entity (hand-written mental model). */
  composition: string;
  /**
   * Root OOP / document type names to open as the structure explorer.
   * Resolved against schemaIndex (prefer persistence, richest field count).
   */
  structureRoots: string[];
  /** Use-case domains that primarily own this entity. */
  domains: string[];
  /** Mongo collection name matchers (case-insensitive substring or regex source). */
  collectionPatterns: string[];
  /** Explicit collection names that always belong (even if pattern misses). */
  collectionNames?: string[];
  /** D03 client class/name patterns for the canonical SoR document. */
  canonicalD03Patterns: string[];
  /** Extra D03 clients needed to complete / enrich the entity. */
  completeD03Patterns: string[];
  /** Kafka topic name patterns for the write / sync path. */
  topicPatterns: string[];
}

/**
 * Curated business entities. Keep this list small and match against catalog data
 * at runtime — never paste field catalogs here.
 */
export const ENTITY_DEFS: EntityDef[] = [
  {
    id: "campaign",
    title: "Campaign",
    summary:
      "Object model for a campaign — nested brands, advance settings, rules, and LPPS characteristics — plus where missing pieces are filled from D03.",
    composition:
      "Start from the Campaign / IndexCatalogCampaign / LoyaltyProgramProductSpec types. Expand nested fields to inspect each part. D03 supplies organization, rule, currency and resource detail that is not fully embedded in the local document.",
    structureRoots: [
      "Campaign",
      "IndexCatalogCampaign",
      "LoyaltyProgramProductSpec",
    ],
    domains: ["campaign", "wholesale"],
    collectionPatterns: [
      "campaign",
      "loyaltyProgramProductSpecification",
      "indexCatalogCampaign",
      "indexLbsCampaign",
      "indexTransferCampaign",
    ],
    collectionNames: ["loyaltyProgramProductSpecification"],
    canonicalD03Patterns: ["LoyaltyProgramProductSpec"],
    completeD03Patterns: [
      "LoyaltyProgramProductSpec",
      "LoyaltyRule",
      "LoyaltyCondition",
      "LoyaltyCurrency",
      "LoyaltyAction",
      "ResourcePool",
      "ResourceSpecification",
      "Organization",
      "ProductOffering",
      "ProjectedCost",
    ],
    topicPatterns: [
      "LoyaltyProgramProductSpec",
      "LoyaltyRuleSet",
      "createCampaign",
      "updateCampaign",
      "deleteCampaign",
    ],
  },
  {
    id: "partner",
    title: "Partner",
    summary:
      "Partner / brand / branch object shapes and the Organization fields completed from D03.",
    composition:
      "Inspect Partner and Organization types. Nested brand/branch parts live locally; organization master fields are completed from D03.",
    structureRoots: ["Organization", "IndexPartner", "Partner"],
    domains: ["partner", "brand", "branch"],
    collectionPatterns: ["partner", "brand", "branch", "merchant"],
    canonicalD03Patterns: ["Organization"],
    completeD03Patterns: ["Organization", "GeographicAddress", "Product"],
    topicPatterns: ["Partner", "Brand", "Branch", "Merchant", "Organization"],
  },
  {
    id: "offer",
    title: "Offer / offer group",
    summary:
      "Offer and offer-group document shapes hanging off a campaign.",
    composition:
      "Open IndexOffer / IndexOfferGroup types to see fields and nested quota/resource refs. D03 ProductOffering and ResourcePool complete offering detail.",
    structureRoots: ["IndexOffer", "IndexOfferGroup", "IndexQuotaGroup"],
    domains: ["offer", "campaign"],
    collectionPatterns: ["offer", "quotaGroup", "resourcePool"],
    collectionNames: ["indexOffers", "indexOfferGroups", "indexQuotaGroups"],
    canonicalD03Patterns: ["ProductOffering", "ResourcePool"],
    completeD03Patterns: [
      "ProductOffering",
      "ResourcePool",
      "ResourceSpecification",
      "LoyaltyProgramProductSpec",
    ],
    topicPatterns: ["Offer", "Quota", "ResourcePool"],
  },
  {
    id: "loyalty-member",
    title: "Loyalty member / account",
    summary:
      "Member and account document structures — fields, nested refs, and D03 completion.",
    composition:
      "Browse LoyaltyProgramMember and LoyaltyAccount field trees. Related currency / party pieces often come from D03.",
    structureRoots: ["LoyaltyProgramMember", "LoyaltyAccount"],
    domains: ["member", "account", "customer"],
    collectionPatterns: [
      "loyaltyProgramMember",
      "loyaltyAccount",
      "loyaltyEarn",
      "loyaltyBurn",
      "loyaltyTransaction",
    ],
    canonicalD03Patterns: ["LoyaltyProgramMember", "LoyaltyAccount"],
    completeD03Patterns: [
      "LoyaltyProgramMember",
      "LoyaltyAccount",
      "LoyaltyCurrency",
      "Customer",
      "Individual",
      "Party",
    ],
    topicPatterns: [
      "LoyaltyMember",
      "LoyaltyAccount",
      "LoyaltyProgramMember",
      "registerLoyaltyMember",
      "onboardLoyaltyMember",
    ],
  },
  {
    id: "currency",
    title: "Currency / currency policy",
    summary:
      "Currency and policy object models used across earn/burn and campaigns.",
    composition:
      "Inspect LoyaltyCurrency and LoyaltyCurrencyPolicy fields. Campaigns and rules reference these by id and complete details from D03.",
    structureRoots: ["LoyaltyCurrency", "LoyaltyCurrencyPolicy"],
    domains: ["currency"],
    collectionPatterns: ["loyaltyCurrency", "currency"],
    canonicalD03Patterns: ["LoyaltyCurrency"],
    completeD03Patterns: ["LoyaltyCurrency", "LoyaltyCurrencyPolicy"],
    topicPatterns: ["LoyaltyCurrency", "CurrencyPolicy"],
  },
  {
    id: "mission",
    title: "Mission",
    summary:
      "Mission-r3 document structure — tasks, quotas, and nested mission parts.",
    composition:
      "Open the Mission type and expand nested task / period fields to check each part of the data.",
    structureRoots: ["Mission"],
    domains: ["mission-r3", "mission"],
    collectionPatterns: ["mission"],
    canonicalD03Patterns: [],
    completeD03Patterns: [
      "LoyaltyProgramProductSpec",
      "LoyaltyProgramMember",
      "Organization",
    ],
    topicPatterns: ["Mission"],
  },
  {
    id: "small-merchant",
    title: "Small merchant",
    summary:
      "Small-merchant document shapes and organization fields filled from D03.",
    composition:
      "Browse small-merchant persistence types; organization profile fields are completed from D03.",
    structureRoots: ["IndexSmallMerchant", "SmallMerchant"],
    domains: ["small-merchant"],
    collectionPatterns: ["smallMerchant", "SmallMerchant"],
    canonicalD03Patterns: ["Organization"],
    completeD03Patterns: ["Organization", "Customer", "Individual"],
    topicPatterns: ["SmallMerchant"],
  },
  {
    id: "customer",
    title: "Customer",
    summary:
      "Customer / individual / party object models and D03 completion.",
    composition:
      "Inspect Customer, Individual and PartyRole field trees. Master profile data is usually completed from D03 / LID.",
    structureRoots: ["Customer", "Individual", "PartyRole"],
    domains: ["customer"],
    collectionPatterns: ["customer", "individual", "party"],
    collectionNames: ["customer", "individual", "partyRole"],
    canonicalD03Patterns: ["Customer", "Individual", "Party"],
    completeD03Patterns: ["Customer", "Individual", "Party", "Organization"],
    topicPatterns: ["Customer", "Individual", "Party"],
  },
];

export function entityDefById(id: string): EntityDef | undefined {
  return ENTITY_DEFS.find((e) => e.id === id);
}
