import { Property, ModalPhrase } from "../types/interfaces";
import { invertPropertyValence } from "./invertPropertyvalence";

export function createAssertionCombinations(
  filterPhrases: Property[],
  modalPhrase: ModalPhrase
): Property[][] {
  return modalPhrase.properties.map((property) => {
    return [...filterPhrases, invertPropertyValence(property)];
  });
}
