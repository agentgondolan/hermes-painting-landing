'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  getOrientedFrameDimensions,
  DEFAULT_FRAME_SIZE_ID,
  type FrameOrientation,
  type FrameSizeId,
} from '@/lib/image-processing'

// Legacy props (from scroll-based hero) + new single-screen props
type ProductSceneCanvasProps = {
  // Legacy
  reducedMotion?: boolean
  rotationY?: number
  frameSizeId?: FrameSizeId
  orientation?: FrameOrientation
  artworkTextureUrl?: string | null
  // New single-screen props
  imageSrc?: string | null
  previewKind?: "none" | "temporary" | "final"
  selectedSize?: { id: string; label: string; widthCm: number; heightCm: number } | null
  isProcessing?: boolean
}

type CanvasDimensions = {
  width: number
  height: number
  depth: number
}

function StudioLighting() {
  return (
    <>
      <color attach="background" args={['#ffffff']} />
      <fog attach="fog" args={['#ffffff', 13, 28]} />
      <ambientLight intensity={1.1} color="#ffffff" />
      <hemisphereLight intensity={0.82} color="#ffffff" groundColor="#d7d7d7" />
      <directionalLight
        castShadow
        position={[5.6, 8.2, 6.6]}
        intensity={2.55}
        color="#ffffff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={28}
        shadow-camera-left={-9.5}
        shadow-camera-right={9.5}
        shadow-camera-top={9.5}
        shadow-camera-bottom={-9.5}
        shadow-bias={-0.00008}
      />
      <directionalLight position={[-5.5, 4.2, 5.4]} intensity={0.42} color="#ffffff" />
      <pointLight position={[0, 4.4, 4.8]} intensity={0.22} color="#ffffff" />
    </>
  )
}

function useOakMaterial() {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#b98352',
        roughness: 0.62,
        metalness: 0.01,
      }),
    [],
  )
}

function createRoundedRectShape(width: number, height: number, radius: number) {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const safeRadius = Math.max(0, Math.min(radius, halfWidth, halfHeight))
  const shape = new THREE.Shape()

  shape.moveTo(-halfWidth + safeRadius, -halfHeight)
  shape.lineTo(halfWidth - safeRadius, -halfHeight)
  shape.absarc(halfWidth - safeRadius, -halfHeight + safeRadius, safeRadius, -Math.PI / 2, 0, false)
  shape.lineTo(halfWidth, halfHeight - safeRadius)
  shape.absarc(halfWidth - safeRadius, halfHeight - safeRadius, safeRadius, 0, Math.PI / 2, false)
  shape.lineTo(-halfWidth + safeRadius, halfHeight)
  shape.absarc(-halfWidth + safeRadius, halfHeight - safeRadius, safeRadius, Math.PI / 2, Math.PI, false)
  shape.lineTo(-halfWidth, -halfHeight + safeRadius)
  shape.absarc(-halfWidth + safeRadius, -halfHeight + safeRadius, safeRadius, Math.PI, Math.PI * 1.5, false)

  return shape
}

function BeveledBox({
  width,
  height,
  depth,
  radius,
  material,
  position,
}: {
  width: number
  height: number
  depth: number
  radius: number
  material: THREE.Material
  position: [number, number, number]
}) {
  const geometry = useMemo(() => {
    const safeRadius = Math.min(radius, width / 2, height / 2, depth / 2)
    const bevelThickness = Math.min(safeRadius * 0.9, depth * 0.16)
    const bevelSize = Math.min(safeRadius, Math.max(0.0008, safeRadius * 0.92))

    const extrude = new THREE.ExtrudeGeometry(createRoundedRectShape(width, height, safeRadius), {
      depth: Math.max(0.0001, depth - bevelThickness * 2),
      bevelEnabled: safeRadius > 0,
      bevelSegments: 2,
      curveSegments: 8,
      steps: 1,
      bevelSize,
      bevelThickness,
    })

    extrude.center()
    extrude.computeVertexNormals()
    return extrude
  }, [depth, height, radius, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return <mesh castShadow receiveShadow geometry={geometry} position={position} material={material} />
}

function Slat({
  start,
  end,
  material,
  thickness = 0.12,
  depth = 0.12,
}: {
  start: [number, number, number]
  end: [number, number, number]
  material: THREE.Material
  thickness?: number
  depth?: number
}) {
  const config = useMemo(() => {
    const startVector = new THREE.Vector3(...start)
    const endVector = new THREE.Vector3(...end)
    const direction = new THREE.Vector3().subVectors(endVector, startVector)
    const length = direction.length()
    const midpoint = new THREE.Vector3().addVectors(startVector, endVector).multiplyScalar(0.5)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    )

    return { length, midpoint, quaternion }
  }, [start, end])

  return (
    <mesh castShadow receiveShadow position={config.midpoint} quaternion={config.quaternion} material={material}>
      <boxGeometry args={[thickness, config.length, depth]} />
    </mesh>
  )
}

function useBaseCanvasTexture() {
  return useMemo(() => {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')

    if (context) {
      context.fillStyle = '#fcfbf7'
      context.fillRect(0, 0, size, size)

      for (let y = 0; y < size; y += 2) {
        const tone = 246 + ((y / 2) % 2)
        context.fillStyle = `rgb(${tone}, ${tone}, ${tone - 1})`
        context.fillRect(0, y, size, 1)
      }

      context.globalAlpha = 0.05
      for (let i = 0; i < 18000; i += 1) {
        const x = Math.random() * size
        const y = Math.random() * size
        const alpha = Math.random() * 0.8
        context.fillStyle = `rgba(214, 208, 198, ${alpha})`
        context.fillRect(x, y, 1, 1)
      }

      context.globalAlpha = 1
      const vignette = context.createRadialGradient(size * 0.45, size * 0.4, size * 0.1, size * 0.5, size * 0.5, size * 0.7)
      vignette.addColorStop(0, 'rgba(255,255,255,0.0)')
      vignette.addColorStop(1, 'rgba(214,206,195,0.16)')
      context.fillStyle = vignette
      context.fillRect(0, 0, size, size)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    return texture
  }, [])
}

function useArtworkTexture(artworkTextureUrl?: string | null) {
  const fallbackTexture = useBaseCanvasTexture()
  const [artworkTexture, setArtworkTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!artworkTextureUrl) {
      setArtworkTexture((current) => {
        current?.dispose()
        return null
      })
      return
    }

    let cancelled = false
    const loader = new THREE.TextureLoader()

    loader.load(
      artworkTextureUrl,
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }

        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.needsUpdate = true

        setArtworkTexture((current) => {
          current?.dispose()
          return texture
        })
      },
      undefined,
      () => {
        if (!cancelled) {
          setArtworkTexture((current) => {
            current?.dispose()
            return null
          })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [artworkTextureUrl])

  useEffect(() => {
    return () => {
      fallbackTexture.dispose()
    }
  }, [fallbackTexture])

  useEffect(() => {
    return () => {
      artworkTexture?.dispose()
    }
  }, [artworkTexture])

  return artworkTexture ?? fallbackTexture
}

function useCanvasDimensions(frameSizeId: FrameSizeId, orientation: FrameOrientation): CanvasDimensions {
  return useMemo(() => {
    const dimensionsCm = getOrientedFrameDimensions(frameSizeId, orientation)
    const worldUnitsPerCm = 0.052

    return {
      width: dimensionsCm.widthCm * worldUnitsPerCm,
      height: dimensionsCm.heightCm * worldUnitsPerCm,
      depth: dimensionsCm.depthCm * worldUnitsPerCm,
    }
  }, [frameSizeId, orientation])
}

function CanvasObject({
  position,
  rotation,
  artworkTextureUrl,
  dimensions,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  artworkTextureUrl?: string | null
  dimensions: CanvasDimensions
}) {
  const canvasTexture = useArtworkTexture(artworkTextureUrl)
  const hasArtwork = Boolean(artworkTextureUrl)

  const frontMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: hasArtwork ? '#ffffff' : '#fbfaf6',
      map: canvasTexture,
      roughness: hasArtwork ? 0.9 : 0.97,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    material.shadowSide = THREE.DoubleSide
    return material
  }, [canvasTexture, hasArtwork])

  const wrapMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#ddd0bf',
      roughness: 0.84,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    material.shadowSide = THREE.DoubleSide
    return material
  }, [])

  const backCanvasMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#e7ddcf',
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    material.shadowSide = THREE.DoubleSide
    return material
  }, [])

  const stretcherMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#b69068',
        roughness: 0.8,
        metalness: 0,
      }),
    [],
  )

  useEffect(
    () => () => {
      frontMaterial.dispose()
      wrapMaterial.dispose()
      backCanvasMaterial.dispose()
      stretcherMaterial.dispose()
    },
    [backCanvasMaterial, frontMaterial, stretcherMaterial, wrapMaterial],
  )

  const width = dimensions.width
  const height = dimensions.height
  const depth = dimensions.depth
  const wrapThickness = Math.max(0.04, Math.min(width, height) * 0.028)
  const wrapEdgeRadius = wrapThickness * 0.06
  const frontZ = depth / 2 - 0.002
  const wrapCenterZ = 0
  const wrapDepth = Math.max(0.02, depth - 0.008)
  const backZ = -depth / 2 + 0.003
  const innerWidth = Math.max(0.08, width - wrapThickness * 2)
  const innerHeight = Math.max(0.08, height - wrapThickness * 2)
  const rearCanvasInset = wrapThickness * 1.6
  const rearCanvasWidth = Math.max(0.06, width - rearCanvasInset * 2)
  const rearCanvasHeight = Math.max(0.06, height - rearCanvasInset * 2)
  const stretcherThickness = Math.max(0.04, Math.min(width, height) * 0.038)
  const stretcherDepth = Math.max(0.032, depth * 0.42)
  const stretcherZ = backZ + stretcherDepth / 2 + 0.008
  const stretcherInset = Math.max(0.08, wrapThickness * 1.9)
  const topStretcherInset = stretcherInset + Math.max(0.04, wrapThickness * 0.85)
  const topFillerInset = wrapThickness * 0.42
  const verticalStretcherTopExtension = stretcherThickness / 2
  const verticalStretcherHeight = height - stretcherInset * 2 + verticalStretcherTopExtension
  const horizontalStretcherWidth = Math.max(0.06, width - stretcherInset * 2)
  const topHorizontalStretcherWidth = Math.max(0.06, width - topStretcherInset * 2)
  const stretcherSideX = width / 2 - stretcherInset
  const stretcherTopY = height / 2 - stretcherInset
  const verticalStretcherCenterY = verticalStretcherTopExtension / 2
  const stretcherBottomY = -height / 2 + stretcherInset
  const stretcherTopFillerWidth = Math.max(0.02, topStretcherInset - stretcherInset - topFillerInset)
  const leftTopFillerX = -width / 2 + topStretcherInset + stretcherTopFillerWidth / 2
  const rightTopFillerX = width / 2 - topStretcherInset - stretcherTopFillerWidth / 2

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow position={[0, 0, frontZ]}>
        <planeGeometry args={[width, height]} />
        <primitive attach="material" object={frontMaterial} />
      </mesh>

      <mesh position={[0, 0, frontZ + 0.001]} receiveShadow>
        <planeGeometry args={[innerWidth, innerHeight]} />
        <meshStandardMaterial
          color={hasArtwork ? '#fff9f2' : '#fffdfa'}
          roughness={0.98}
          metalness={0}
          transparent
          opacity={hasArtwork ? 0.08 : 0.3}
        />
      </mesh>

      <BeveledBox
        width={wrapThickness}
        height={height}
        depth={wrapDepth}
        radius={wrapEdgeRadius}
        position={[-width / 2 + wrapThickness / 2, 0, wrapCenterZ]}
        material={wrapMaterial}
      />
      <BeveledBox
        width={wrapThickness}
        height={height}
        depth={wrapDepth}
        radius={wrapEdgeRadius}
        position={[width / 2 - wrapThickness / 2, 0, wrapCenterZ]}
        material={wrapMaterial}
      />
      <BeveledBox
        width={innerWidth}
        height={wrapThickness}
        depth={wrapDepth}
        radius={wrapEdgeRadius}
        position={[0, height / 2 - wrapThickness / 2, wrapCenterZ]}
        material={wrapMaterial}
      />
      <BeveledBox
        width={innerWidth}
        height={wrapThickness}
        depth={wrapDepth}
        radius={wrapEdgeRadius}
        position={[0, -height / 2 + wrapThickness / 2, wrapCenterZ]}
        material={wrapMaterial}
      />

      <mesh castShadow receiveShadow position={[0, 0, backZ]}>
        <planeGeometry args={[rearCanvasWidth, rearCanvasHeight]} />
        <primitive attach="material" object={backCanvasMaterial} />
      </mesh>

      <mesh castShadow receiveShadow position={[-stretcherSideX, verticalStretcherCenterY, stretcherZ]} material={stretcherMaterial}>
        <boxGeometry args={[stretcherThickness, verticalStretcherHeight, stretcherDepth]} />
      </mesh>
      <mesh castShadow receiveShadow position={[stretcherSideX, verticalStretcherCenterY, stretcherZ]} material={stretcherMaterial}>
        <boxGeometry args={[stretcherThickness, verticalStretcherHeight, stretcherDepth]} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, stretcherTopY, stretcherZ]} material={stretcherMaterial}>
        <boxGeometry args={[topHorizontalStretcherWidth, stretcherThickness, stretcherDepth]} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, stretcherBottomY, stretcherZ]} material={stretcherMaterial}>
        <boxGeometry args={[horizontalStretcherWidth, stretcherThickness, stretcherDepth]} />
      </mesh>
      <mesh castShadow receiveShadow position={[leftTopFillerX, stretcherTopY, stretcherZ]} material={stretcherMaterial}>
        <boxGeometry args={[stretcherTopFillerWidth, stretcherThickness, stretcherDepth]} />
      </mesh>
      <mesh castShadow receiveShadow position={[rightTopFillerX, stretcherTopY, stretcherZ]} material={stretcherMaterial}>
        <boxGeometry args={[stretcherTopFillerWidth, stretcherThickness, stretcherDepth]} />
      </mesh>
    </group>
  )
}

function Easel({
  artworkTextureUrl,
  frameSizeId,
  orientation,
}: {
  artworkTextureUrl?: string | null
  frameSizeId: FrameSizeId
  orientation: FrameOrientation
}) {
  const oakMaterial = useOakMaterial()
  const dimensions = useCanvasDimensions(frameSizeId, orientation)

  const frontLegThickness = 0.14
  const frontLegDepth = 0.14
  const braceThickness = 0.14
  const braceDepth = 0.24

  const topJoint: [number, number, number] = [0, 4.2, 0.06]
  const frontLeftFoot: [number, number, number] = [-1.42, 0, 0.42]
  const frontRightFoot: [number, number, number] = [1.42, 0, 0.42]
  const rearFoot: [number, number, number] = [0, 0, -1.14]

  const braceY = 0.64
  const braceOuterZ = 0.42
  const braceHalfWidth = 1.4
  const braceLeft: [number, number, number] = [-braceHalfWidth, braceY, braceOuterZ]
  const braceRight: [number, number, number] = [braceHalfWidth, braceY, braceOuterZ]

  const frontLegDirection = useMemo(
    () => new THREE.Vector3().subVectors(new THREE.Vector3(...topJoint), new THREE.Vector3(...frontLeftFoot)).normalize(),
    [frontLeftFoot, topJoint],
  )
  const canvasTiltX = Math.atan2(frontLegDirection.z, frontLegDirection.y)
  const canvasBottomY = braceY + braceThickness / 2 + 0.01
  const canvasCenterY = canvasBottomY + dimensions.height / 2
  const frontLegLerpAtCanvasBottom = canvasBottomY / topJoint[1]
  const frontLegCenterAtCanvasBottom = new THREE.Vector3(...frontLeftFoot).lerp(new THREE.Vector3(...topJoint), frontLegLerpAtCanvasBottom)
  const frontLegQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), frontLegDirection)
  const frontLegFrontFaceOffset = new THREE.Vector3(0, 0, frontLegDepth / 2).applyQuaternion(frontLegQuaternion)
  const supportContactPoint = frontLegCenterAtCanvasBottom.clone().add(frontLegFrontFaceOffset)

  // Keep the current bottom-edge contact logic, but match the frame tilt to the front-leg pitch
  // so the rear canvas plane stays parallel with the front support face across the full height.
  const canvasBottomRearContactOffsetZ =
    (-dimensions.height / 2) * Math.sin(canvasTiltX) + (-dimensions.depth / 2) * Math.cos(canvasTiltX)
  const canvasCenterZ = supportContactPoint.z - canvasBottomRearContactOffsetZ

  return (
    <group position={[0, 0.02, 0]}>
      <Slat start={frontLeftFoot} end={topJoint} material={oakMaterial} thickness={frontLegThickness} depth={frontLegDepth} />
      <Slat start={frontRightFoot} end={topJoint} material={oakMaterial} thickness={frontLegThickness} depth={frontLegDepth} />
      <Slat start={rearFoot} end={topJoint} material={oakMaterial} thickness={0.15} depth={0.15} />
      <Slat start={braceLeft} end={braceRight} material={oakMaterial} thickness={braceThickness} depth={braceDepth} />

      <mesh castShadow receiveShadow position={topJoint} rotation={[0, 0, Math.PI / 2]} material={oakMaterial}>
        <cylinderGeometry args={[0.08, 0.08, 0.22, 18]} />
      </mesh>

      <CanvasObject
        position={[0, canvasCenterY, canvasCenterZ]}
        rotation={[canvasTiltX, 0, 0]}
        artworkTextureUrl={artworkTextureUrl}
        dimensions={dimensions}
      />
    </group>
  )
}

function StageFloor() {
  const floorRotation: [number, number, number] = [-Math.PI / 2, 0, 0]
  const floorPosition: [number, number, number] = [0.02, -2.552, 0.1]

  return (
    <group>
      <mesh rotation={floorRotation} position={floorPosition}>
        <circleGeometry args={[7.7, 96]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh rotation={floorRotation} position={[floorPosition[0], floorPosition[1] + 0.0015, floorPosition[2]]} receiveShadow>
        <circleGeometry args={[7.7, 96]} />
        <shadowMaterial transparent opacity={0.26} />
      </mesh>
    </group>
  )
}

function ProductRig({ reducedMotion = false, rotationY = 0, artworkTextureUrl, frameSizeId = DEFAULT_FRAME_SIZE_ID, orientation = "vertical" }: ProductSceneCanvasProps) {
  const group = useRef<THREE.Group>(null)
  const dimensions = useCanvasDimensions(frameSizeId, orientation)
  const baseTiltX = reducedMotion ? -0.035 : -0.06
  const basePositionY = -2.54
  const basePositionZ = 0.08
  const easelScale = 1.08
  const widthLift = (dimensions.width - 2.08) * 0.055

  useFrame((state, delta) => {
    if (!group.current) {
      return
    }

    const time = state.clock.getElapsedTime()
    const idleX = reducedMotion ? baseTiltX : baseTiltX + Math.cos(time * 0.36) * 0.004
    const idleY = reducedMotion ? 0 : Math.sin(time * 0.28) * 0.012

    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, idleX, 1 - Math.exp(-delta * 2.6))
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, rotationY + idleY, 1 - Math.exp(-delta * 3))
    group.current.position.y = basePositionY - widthLift
    group.current.position.z = basePositionZ
  })

  return (
    <>
      <StageFloor />

      <group ref={group} position={[0, basePositionY, basePositionZ]} rotation={[baseTiltX, rotationY, 0]}>
        <group scale={easelScale}>
          <Easel artworkTextureUrl={artworkTextureUrl} frameSizeId={frameSizeId} orientation={orientation} />
        </group>
      </group>
    </>
  )
}

export function ProductSceneCanvas(props: ProductSceneCanvasProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [4.55, 1.95, 12.1], fov: 29, near: 0.1, far: 40 }}
    >
      <StudioLighting />
      <ProductRig {...props} />
    </Canvas>
  )
}
