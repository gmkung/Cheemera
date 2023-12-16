// utils/invertPropertyValence.ts
import { Property } from '../types/interfaces';

export function invertPropertyValence(property: Property): Property {
    return { ...property, valence: !property.valence };
}