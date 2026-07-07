import type { DataRow, ExcelOperation } from "@/features/excel/types";

export interface PromptInterpreter {
  interpret(prompt: string, rows: DataRow[]): ExcelOperation[];
}

function simplify(value: string) {
  return value.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findColumn(prompt: string, columns: string[]) {
  const normalizedPrompt = simplify(prompt);
  return [...columns]
    .sort((a, b) => b.length - a.length)
    .find((column) => normalizedPrompt.includes(simplify(column)));
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export class RuleBasedPromptInterpreter implements PromptInterpreter {
  interpret(prompt: string, rows: DataRow[]): ExcelOperation[] {
    const columns = Object.keys(rows[0] ?? {});
    const normalized = simplify(prompt);
    const operations: ExcelOperation[] = [];
    const column = findColumn(prompt, columns);

    const requestsCompanyComparison =
      /zweite|2\.|vergleich|vergleichen|liste/.test(normalized) &&
      /firma|firmen|unternehmen|company/.test(normalized) &&
      /markier|rot|hintergrundfarbe/.test(normalized);

    if (requestsCompanyComparison) {
      return [{ type: "compareCompaniesWithList", column }];
    }

    const requestsDomainWorkflow =
      /domain|url/.test(normalized) &&
      /http|https|protokoll/.test(normalized) &&
      /doppelt|duplikat|duplicate/.test(normalized) &&
      /markier|rot|hintergrundfarbe/.test(normalized);

    if (requestsDomainWorkflow && column) {
      return [{ type: "domainDuplicateWorkflow", column }];
    }

    if (/entfern|losch|lösch/.test(normalized) && /doppelt|duplikat|duplicate/.test(normalized)) {
      operations.push({ type: "deduplicate", column });
    }

    if (/sortier|sort |alphabetisch|aufsteigend|absteigend/.test(normalized) && column) {
      operations.push({
        type: "sort",
        column,
        direction: /absteigend|descending|z-a/.test(normalized) ? "desc" : "asc",
      });
    }

    if (/gruppier|group/.test(normalized) && column) {
      operations.push({ type: "group", column });
    }

    if (/ahnliche|ähnliche|zusammenfass|vereinheitlich|normalisier/.test(normalized) && column) {
      operations.push({ type: "normalize", column });
    }

    const filterMatch = normalized.match(/(?:uber|über|großer als|mehr als|mindestens|unter|weniger als|kleiner als)\s*(?:€|eur|euro)?\s*([\d.,]+)/);
    if (/filter|datensatze|datensätze|werte/.test(normalized) && filterMatch && column) {
      const value = parseNumber(filterMatch[1]);
      if (value !== null) {
        const operator = /unter|weniger als|kleiner als/.test(normalized) ? "lt" : /mindestens/.test(normalized) ? "gte" : "gt";
        operations.push({ type: "filter", column, operator, value });
      }
    }

    if (operations.length === 0) {
      throw new Error("Die Anweisung konnte nicht eindeutig erkannt werden. Nennen Sie eine Spalte und eine Aktion, z. B. „Sortiere nach Nachname alphabetisch“.");
    }

    return operations;
  }
}
