declare module 'fast-formula-parser' {
  export interface CellRef { sheet: string; row: number; col: number }
  export interface RangeRef { sheet: string; from: { row: number; col: number }; to: { row: number; col: number } }
  export class FormulaError extends Error {
    constructor(error: string, msg?: string, details?: unknown)
    readonly error: string
  }
  export interface ParserConfig {
    onCell?: (ref: CellRef) => unknown
    onRange?: (ref: RangeRef) => unknown[][]
    onVariable?: (name: string, sheet?: string) => unknown
  }
  export default class FormulaParser {
    constructor(config?: ParserConfig)
    parse(formula: string, position: { row: number; col: number; sheet: string }, allowReturnArray?: boolean): unknown
    static MAX_ROW: number
    static MAX_COLUMN: number
    static FormulaError: typeof FormulaError
  }
}
