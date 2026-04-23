import type { Hop } from '../types/brewfather';

export const getHopPackageSize = (hop: Hop) => {
    return hop.name.toLowerCase().includes('(25g)') ? 25 : 50;
};

export const getHopAmountInGrams = (hop: Hop) => {
    const hopPackageSize = getHopPackageSize(hop);
    const packagesNeeded = Math.ceil(hop.amount / hopPackageSize);
    return packagesNeeded * hopPackageSize;
};
