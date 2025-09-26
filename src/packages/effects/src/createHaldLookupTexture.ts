import { LookupTexture, RawImageData } from 'postprocessing'
import type { Texture } from 'three'

export function createHaldLookupTexture(texture: Texture): LookupTexture {
  const { image } = texture
  const { width, height } = image
  if (width !== height) {
    throw new Error('Hald CLUT image must be square.')
  }
  const size = Math.cbrt(width * height)
  if (size % 1 !== 0) {
    throw new Error('Hald CLUT image must be cubic.')
  }
  const { data } = RawImageData.from(image)
  const lut = new LookupTexture(data, size)
  lut.name = texture.name
  lut.type = texture.type
  texture.colorSpace = lut.colorSpace
  return lut
}
