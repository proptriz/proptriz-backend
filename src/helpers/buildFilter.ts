export const buildHybridSearchCriteria = (search_query?: string) => {
  if (!search_query || !search_query.trim()) return {};

  const tokens = search_query.trim().split(/\s+/);
  const fields = ["title", "address", "property_terms"];

  const regexFilters = tokens.map((token) => ({
    $or: fields.map((field) => ({
      [field]: { $regex: token, $options: "i" },
    })),
  }));

  return {
    $or: [
      { $text: { $search: search_query, $caseSensitive: false } },
      { $and: regexFilters },
    ],
  };
};

export const buildGranularSearchCriteria = (search_query?: string) => {
  if (!search_query || !search_query.trim()) return {};

  // Normalize and split words
  const tokens = search_query
    .trim()
    .split(/\s+/) // split by spaces, tabs, multiple whitespace
    .filter(Boolean);

  // Each token will match these fields
  const fields = ["title", "address", "property_terms"];

  // Create a $and query where each word must match one of the fields
  const andConditions = tokens.map((token) => ({
    $or: fields.map((field) => ({
      [field]: { $regex: token, $options: "i" }, // case-insensitive
    })),
  }));

  // Combine conditions
  const criteria = { $and: andConditions };

  return criteria;
};

