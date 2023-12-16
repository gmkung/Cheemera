// Example utility function
import { Property } from '../types/interfaces';

export function deduplicateProperties(properties: Property[]): Property[] {
    return properties.filter((property, index, self) =>
        index === self.findIndex((t) => (
            t.sentence === property.sentence && t.valence === property.valence
        ))
    );
}

