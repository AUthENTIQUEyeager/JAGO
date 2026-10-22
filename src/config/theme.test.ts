import { describe, expect, it } from 'vitest'
import { applyTheme } from './applyTheme'
import { brand } from './brand'
import { buildScale, hexToTriplet, isValidHex, THEME_STEPS } from './theme'
import { parseSettings } from '@/db/settings'

describe('thème', () => {
  it('convertit un hexadécimal en triplet RGB', () => {
    expect(hexToTriplet('#155c43')).toBe('21 92 67')
  })

  it('valide les couleurs hexadécimales', () => {
    expect(isValidHex('#1d4ed8')).toBe(true)
    expect(isValidHex('1d4ed8')).toBe(false)
    expect(isValidHex('red')).toBe(false)
    expect(isValidHex(undefined)).toBe(false)
  })

  it('construit 10 nuances, de la plus claire à la plus foncée', () => {
    const scale = buildScale('#1d4ed8')
    expect(Object.keys(scale)).toHaveLength(THEME_STEPS.length)
    const brightness = (triplet: string) => {
      const [r, g, b] = triplet.split(' ').map(Number)
      return (r ?? 0) + (g ?? 0) + (b ?? 0)
    }
    for (let i = 1; i < THEME_STEPS.length; i++) {
      const prev = THEME_STEPS[i - 1] as 50
      const step = THEME_STEPS[i] as 100
      expect(brightness(scale[step])).toBeLessThan(brightness(scale[prev]))
    }
  })

  it('applique et retire les variables CSS', () => {
    applyTheme({ primary: '#1d4ed8', accent: '#ec4899' })
    expect(document.documentElement.style.getPropertyValue('--brand-700')).not.toBe('')
    expect(document.documentElement.style.getPropertyValue('--accent-400')).not.toBe('')
    applyTheme(null)
    expect(document.documentElement.style.getPropertyValue('--brand-700')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--accent-400')).toBe('')
  })

  it('met à jour la couleur de la barre du navigateur', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
    applyTheme({ primary: '#7c3aed' })
    expect(meta.getAttribute('content')).toBe('#7c3aed')
    applyTheme(undefined)
    expect(meta.getAttribute('content')).toBe(brand.colors.themeColor)
    meta.remove()
  })

  it('les réglages acceptent un thème valide et refusent le reste', () => {
    expect(parseSettings({ theme: { primary: '#1d4ed8' } }).theme).toEqual({ primary: '#1d4ed8' })
    // Réglages invalides : retour aux valeurs par défaut, jamais de plantage.
    expect(parseSettings({ theme: { primary: 'javascript:alert(1)' } }).theme).toBeUndefined()
  })
})
