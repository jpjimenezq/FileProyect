import { describe, expect, it } from 'vitest'
import { insertionIndex, moveTo } from './SortableGrid'

describe('insertionIndex', () => {
  const rect = { left: 100, width: 200 }
  it('mitad izquierda: antes; mitad derecha: después', () => {
    expect(insertionIndex(3, 120, rect)).toBe(3)
    expect(insertionIndex(3, 280, rect)).toBe(4)
  })
})

describe('moveTo', () => {
  const abcd = ['a', 'b', 'c', 'd']
  it('suelta entre dos elementos, hacia delante y hacia atrás', () => {
    expect(moveTo(abcd, 0, 3)).toEqual(['b', 'c', 'a', 'd']) // entre c y d
    expect(moveTo(abcd, 3, 1)).toEqual(['a', 'd', 'b', 'c']) // entre a y b
  })
  it('al principio y al final', () => {
    expect(moveTo(abcd, 2, 0)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveTo(abcd, 1, 4)).toEqual(['a', 'c', 'd', 'b'])
  })
  it('soltarlo donde ya estaba no cambia nada', () => {
    expect(moveTo(abcd, 1, 1)).toBe(abcd)
    expect(moveTo(abcd, 1, 2)).toBe(abcd)
  })
})
