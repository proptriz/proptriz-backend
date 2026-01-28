
export const computeRating = (ratings: number[]): number => {
  if (ratings.length === 0) return 5.0; // Default rating if no ratings available
  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return sum / ratings.length;
};