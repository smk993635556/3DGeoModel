import React, { useRef, useState, useMemo, useImperativeHandle, forwardRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, Html, Text, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import html2canvas from 'html2canvas';
import { GeologicalLayer, ModelSettings, Vector3 } from '../types';

// Custom material to handle excavations (holes)
const LayerMaterial = ({ color, opacity, wireframe, emissive, emissiveIntensity, excavations }: any) => {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shaderRef = useRef<any>(null);

  const uniforms = useMemo(() => {
    const data = (excavations || []).map((ex: any) => ({
      pos: new THREE.Vector3(ex.position.x, ex.position.y, ex.position.z),
      size: new THREE.Vector3(ex.size.x, ex.size.y, ex.size.z)
    }));
    
    while (data.length < 10) {
      data.push({
        pos: new THREE.Vector3(0, 0, 0),
        size: new THREE.Vector3(0, 0, 0)
      });
    }

    return {
      uExcavations: { value: data },
      uExcavationCount: { value: (excavations || []).length }
    };
  }, [excavations]);

  // Update uniforms directly if shader is already compiled
  useEffect(() => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uExcavations.value = uniforms.uExcavations.value;
      shaderRef.current.uniforms.uExcavationCount.value = uniforms.uExcavationCount.value;
    }
  }, [uniforms]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.onBeforeCompile = (shader) => {
        shaderRef.current = shader;
        shader.uniforms.uExcavations = uniforms.uExcavations;
        shader.uniforms.uExcavationCount = uniforms.uExcavationCount;

        shader.vertexShader = `
          varying vec3 vWorldPosition;
          ${shader.vertexShader}
        `.replace(
          '#include <worldpos_vertex>',
          `
          #include <worldpos_vertex>
          vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          `
        );

        shader.fragmentShader = `
          struct Excavation {
            vec3 pos;
            vec3 size;
          };
          uniform Excavation uExcavations[10];
          uniform int uExcavationCount;
          varying vec3 vWorldPosition;
          ${shader.fragmentShader}
        `.replace(
          '#include <clipping_planes_fragment>',
          `
          #include <clipping_planes_fragment>
          for (int i = 0; i < 10; i++) {
            if (i >= uExcavationCount) break;
            vec3 dist = abs(vWorldPosition - uExcavations[i].pos);
            vec3 halfSize = uExcavations[i].size * 0.5;
            if (dist.x < halfSize.x && dist.y < halfSize.y && dist.z < halfSize.z) {
              discard;
            }
          }
          `
        );
      };
      materialRef.current.needsUpdate = true;
    }
  }, [uniforms]);

  return (
    <meshStandardMaterial
      ref={materialRef}
      color={color}
      transparent={opacity < 1}
      opacity={opacity}
      wireframe={wireframe}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      side={THREE.DoubleSide}
      polygonOffset
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
      depthWrite={true}
      depthTest={true}
    />
  );
};

interface LayerMeshProps {
  layer: GeologicalLayer;
  index: number;
  allLayers: GeologicalLayer[];
  settings: ModelSettings;
  onHover: (layer: GeologicalLayer | null) => void;
  onClick: (layer: GeologicalLayer) => void;
  isSelected: boolean;
  onVertexUpdate?: (layerId: string, vertexIndex: number, offset: number) => void;
}

const LayerMesh: React.FC<LayerMeshProps> = ({ layer, index, allLayers, settings, onHover, onClick, isSelected, onVertexUpdate }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const totalHeight = useMemo(() => allLayers.reduce((sum, l) => sum + l.thickness, 0), [allLayers]);

  // Calculate the base Y position (center of the layer in a flat stack)
  const yBase = useMemo(() => {
    let offset = totalHeight / 2;
    for (let i = 0; i < index; i++) {
      offset -= allLayers[i].thickness;
    }
    return offset - layer.thickness / 2;
  }, [index, allLayers, layer.thickness, totalHeight]);

  // Generate custom geometry to handle dip, strike, and vertex offsets
  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(settings.length, layer.thickness, settings.width, 1, 1, 1);
    const posAttr = geo.attributes.position;
    
    const dipRad = THREE.MathUtils.degToRad(settings.dip);
    const dirRad = THREE.MathUtils.degToRad(settings.dipDirection);
    const tanDip = Math.tan(dipRad);

    // Calculate min shear to ensure thinnest part is 'thickness'
    const corners = [
      { x: -settings.length / 2, z: -settings.width / 2 },
      { x: settings.length / 2, z: -settings.width / 2 },
      { x: -settings.length / 2, z: settings.width / 2 },
      { x: settings.length / 2, z: settings.width / 2 },
    ];
    const minShear = Math.min(...corners.map(c => c.x * tanDip * Math.cos(dirRad) + c.z * tanDip * Math.sin(dirRad)));

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const shearY = x * tanDip * Math.cos(dirRad) + z * tanDip * Math.sin(dirRad);
      const shearYAdj = shearY - minShear;

      let faultY = 0;
      settings.faults.forEach(fault => {
        const isLeftSide = x < 0; 
        if ((fault.side === 'left' && isLeftSide) || (fault.side === 'right' && !isLeftSide)) {
          faultY += fault.offset;
        }
      });

      // Calculate absolute Y positions based on stacking from bottom to top
      // index 0 is TOP, index allLayers.length-1 is BOTTOM
      const layersBelow = allLayers.slice(index + 1);
      const thicknessBelow = layersBelow.reduce((sum, l) => sum + l.thickness, 0);
      
      // Sum of vertex offsets of all layers below
      let prevCustomY = 0;
      layersBelow.forEach(prevLayer => {
        if (prevLayer.vertexOffsets) {
          const isLeft = x < 0;
          let vIdx = -1;
          if (isLeft && z < 0) vIdx = 0;
          else if (!isLeft && z < 0) vIdx = 1;
          else if (isLeft && z >= 0) vIdx = 2;
          else if (!isLeft && z >= 0) vIdx = 3;
          if (vIdx !== -1) prevCustomY += prevLayer.vertexOffsets[vIdx] || 0;
        }
      });

      // Current layer's vertex offset (applied to its top surface)
      let customY = 0;
      if (layer.vertexOffsets) {
        const isLeft = x < 0;
        let vIdx = -1;
        if (isLeft && z < 0) vIdx = 0;
        else if (!isLeft && z < 0) vIdx = 1;
        else if (isLeft && z >= 0) vIdx = 2;
        else if (!isLeft && z >= 0) vIdx = 3;
        if (vIdx !== -1) customY = layer.vertexOffsets[vIdx] || 0;
      }

      // Bottom surface of this layer:
      // If it's the bottom-most layer, its bottom is flat (except faults)
      // Otherwise, it follows the top surface of the layer below (which includes shear and its own offsets)
      const isBottomLayer = index === allLayers.length - 1;
      const yBottom = -totalHeight / 2 + thicknessBelow + faultY + (isBottomLayer ? 0 : shearYAdj) + prevCustomY;
      
      // Top surface of this layer:
      const yTop = -totalHeight / 2 + thicknessBelow + layer.thickness + faultY + shearYAdj + prevCustomY + customY;

      posAttr.setY(i, (y > 0 ? yTop : yBottom) - yBase);
    }
    
    geo.computeVertexNormals();
    return geo;
  }, [settings.length, settings.width, layer.thickness, settings.dip, settings.dipDirection, settings.faults, layer.vertexOffsets, allLayers, index, totalHeight, yBase]);

  return (
    <group position={[0, yBase, 0]}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(layer);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(layer);
        }}
      >
        <LayerMaterial
          color={isSelected ? '#ffffff' : layer.color}
          opacity={layer.opacity}
          wireframe={settings.wireframe}
          emissive={isSelected ? '#ffffff' : (hovered ? layer.color : 'black')}
          emissiveIntensity={isSelected ? 0.5 : (hovered ? 0.3 : 0)}
          excavations={settings.excavations}
        />
      </mesh>
      
      {/* Design Mode Handles */}
      {settings.designMode && isSelected && (
        <group>
          {[
            { x: -settings.length/2, z: -settings.width/2, label: 'TL' },
            { x: settings.length/2, z: -settings.width/2, label: 'TR' },
            { x: -settings.length/2, z: settings.width/2, label: 'BL' },
            { x: settings.length/2, z: settings.width/2, label: 'BR' },
          ].map((v, i) => {
            const currentOffset = layer.vertexOffsets?.[i] || 0;
            const dipRad = THREE.MathUtils.degToRad(settings.dip);
            const dirRad = THREE.MathUtils.degToRad(settings.dipDirection);
            const shearY = v.x * Math.tan(dipRad) * Math.cos(dirRad) + v.z * Math.tan(dipRad) * Math.sin(dirRad);
            
            return (
              <group key={i} position={[v.x, layer.thickness/2 + shearY + currentOffset, v.z]}>
                <mesh 
                  onClick={(e) => {
                    e.stopPropagation();
                    const val = prompt(`输入 ${v.label} 顶点的 Y 轴偏移量 (当前: ${currentOffset}m):`, currentOffset.toString());
                    if (val !== null) onVertexUpdate?.(layer.id, i, parseFloat(val));
                  }}
                >
                  <sphereGeometry args={[0.6]} />
                  <meshBasicMaterial color="#3b82f6" depthTest={false} transparent opacity={0.8} />
                </mesh>
                <Html distanceFactor={10}>
                  <div className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap border border-blue-400">
                    {v.label}: {currentOffset}m
                  </div>
                </Html>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
};

export interface ViewerRef {
  setCameraView: (view: 'top' | 'front' | 'side' | 'iso') => void;
  takeScreenshot: (scale?: number) => Promise<string>;
  exportVectorSVG: (layers: GeologicalLayer[], settings: ModelSettings) => string;
}

interface ViewerProps {
  layers: GeologicalLayer[];
  settings: ModelSettings;
  selectedLayerId: string | null;
  onHoverLayer: (layer: GeologicalLayer | null) => void;
  onSelectLayer: (layer: GeologicalLayer | null) => void;
  onUpdateLayer?: (id: string, updates: Partial<GeologicalLayer>) => void;
}

const CameraController = forwardRef<ViewerRef, { onDeselect: () => void, layers: GeologicalLayer[], settings: ModelSettings, containerRef: React.RefObject<HTMLDivElement> }>((props, ref) => {
  const { camera, gl, scene, controls } = useThree() as any;

  useImperativeHandle(ref, () => ({
    setCameraView: (view) => {
      if (!camera || !controls) return;

      const distance = 25;
      switch (view) {
        case 'top':
          camera.position.set(0, distance, 0);
          break;
        case 'front':
          camera.position.set(0, 0, distance);
          break;
        case 'side':
          camera.position.set(distance, 0, 0);
          break;
        case 'iso':
          camera.position.set(distance, distance, distance);
          break;
      }
      controls.target.set(0, 0, 0);
      camera.updateProjectionMatrix();
    },
    takeScreenshot: async (scale = 1) => {
      // Ensure WebGL is rendered
      gl.render(scene, camera);
      
      const originalPixelRatio = gl.getPixelRatio();
      const originalSize = new THREE.Vector2();
      gl.getSize(originalSize);

      // If scale > 1, we need to re-render at higher resolution
      if (scale > 1) {
        gl.setPixelRatio(scale);
        gl.setSize(originalSize.x, originalSize.y, false);
        gl.render(scene, camera);
      }

      const webglDataUrl = gl.domElement.toDataURL('image/png');

      // Reset GL if scaled
      if (scale > 1) {
        gl.setPixelRatio(originalPixelRatio);
        gl.setSize(originalSize.x, originalSize.y, true);
      }

      if (!props.containerRef?.current) return webglDataUrl;
      
      // Use html2canvas but with a fallback if it fails or doesn't capture WebGL correctly
      try {
        const canvas = await html2canvas(props.containerRef.current, {
          useCORS: true,
          scale: scale,
          backgroundColor: props.settings.backgroundMode === 'day' ? '#f1f5f9' : '#0f172a',
          logging: false,
          onclone: (clonedDoc) => {
            // Ensure the canvas in the clone is visible
            const canvasInClone = clonedDoc.querySelector('canvas');
            if (canvasInClone) {
              canvasInClone.style.visibility = 'visible';
            }
          }
        });
        return canvas.toDataURL('image/png');
      } catch (e) {
        console.error('html2canvas failed, falling back to WebGL only capture', e);
        return webglDataUrl;
      }
    },
    exportVectorSVG: (layers, settings) => {
      const width = gl.domElement.clientWidth;
      const height = gl.domElement.clientHeight;
      
      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
      // Transparent background as requested
      svgContent += `<rect width="100%" height="100%" fill="none" />`; 

      // Helper to project 3D point to SVG 2D point
      const project = (vec: THREE.Vector3) => {
        const v = vec.clone().project(camera);
        return {
          x: (v.x + 1) * width / 2,
          y: (-v.y + 1) * height / 2
        };
      };

      // Render Layers
      const allFaces: any[] = [];
      const l = settings.length;
      const w = settings.width;
      const tanDip = Math.tan(THREE.MathUtils.degToRad(settings.dip));
      const dirRad = THREE.MathUtils.degToRad(settings.dipDirection);
      const corners = [
        { x: -l/2, z: -w/2 }, { x: l/2, z: -w/2 },
        { x: -l/2, z: w/2 }, { x: l/2, z: w/2 }
      ];
      const minShear = Math.min(...corners.map(c => c.x * tanDip * Math.cos(dirRad) + c.z * tanDip * Math.sin(dirRad)));
      const totalH = layers.reduce((s, curr) => s + curr.thickness, 0);

      layers.forEach((layer, idx) => {
        const vertices = [
          new THREE.Vector3(-l/2, -0.5, -w/2), new THREE.Vector3(l/2, -0.5, -w/2),
          new THREE.Vector3(l/2, -0.5, w/2), new THREE.Vector3(-l/2, -0.5, w/2),
          new THREE.Vector3(-l/2, 0.5, -w/2), new THREE.Vector3(l/2, 0.5, -w/2),
          new THREE.Vector3(l/2, 0.5, w/2), new THREE.Vector3(-l/2, 0.5, w/2)
        ];

        const worldPoints = vertices.map((v) => {
          const x = v.x;
          const z = v.z;
          const shearY = x * tanDip * Math.cos(dirRad) + z * tanDip * Math.sin(dirRad);
          const shearYAdj = shearY - minShear;

          let faultY = 0;
          settings.faults.forEach(fault => {
            const isLeftSide = x < 0; 
            if ((fault.side === 'left' && isLeftSide) || (fault.side === 'right' && !isLeftSide)) {
              faultY += fault.offset;
            }
          });

          const layersBelow = layers.slice(idx + 1);
          const thicknessBelow = layersBelow.reduce((sum, l) => sum + l.thickness, 0);

          let prevCustomY = 0;
          layersBelow.forEach(prevLayer => {
            if (prevLayer.vertexOffsets) {
              const isLeft = x < 0;
              let vIdx = -1;
              if (isLeft && z < 0) vIdx = 0;
              else if (!isLeft && z < 0) vIdx = 1;
              else if (isLeft && z >= 0) vIdx = 2;
              else if (!isLeft && z >= 0) vIdx = 3;
              if (vIdx !== -1) prevCustomY += prevLayer.vertexOffsets[vIdx] || 0;
            }
          });

          let customY = 0;
          if (layer.vertexOffsets && v.y > 0) {
            const isLeft = x < 0;
            let vIdx = -1;
            if (isLeft && z < 0) vIdx = 0;
            else if (!isLeft && z < 0) vIdx = 1;
            else if (isLeft && z >= 0) vIdx = 2;
            else if (!isLeft && z >= 0) vIdx = 3;
            if (vIdx !== -1) customY = layer.vertexOffsets[vIdx] || 0;
          }

          const isBottomLayer = idx === layers.length - 1;
          const yBottom = -totalH / 2 + thicknessBelow + faultY + (isBottomLayer ? 0 : shearYAdj) + prevCustomY;
          const yTop = -totalH / 2 + thicknessBelow + layer.thickness + faultY + shearYAdj + prevCustomY + customY;

          const worldV = v.clone();
          worldV.y = v.y > 0 ? yTop : yBottom;
          return worldV;
        });

        const faceIndices = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [0, 1, 2, 3]];
        faceIndices.forEach((face) => {
          const faceVertices = face.map(pIdx => worldPoints[pIdx]);
          const centroid = new THREE.Vector3(0, 0, 0);
          faceVertices.forEach(v => centroid.add(v));
          centroid.divideScalar(faceVertices.length);
          
          const projectedCentroid = centroid.clone().project(camera);
          allFaces.push({
            points: faceVertices.map(v => project(v)),
            color: layer.color,
            opacity: layer.opacity || 1,
            depth: projectedCentroid.z
          });
        });
      });

      // Sort all faces by depth (back to front)
      allFaces.sort((a, b) => b.depth - a.depth);

      allFaces.forEach(face => {
        const pointsStr = face.points.map((p: any) => `${p.x},${p.y}`).join(' ');
        const strokeColor = settings.backgroundMode === 'day' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
        svgContent += `<polygon points="${pointsStr}" fill="${face.color}" fill-opacity="${face.opacity}" stroke="${strokeColor}" stroke-width="0.5" />`;
      });

      // Render Annotations if enabled
      if (settings.includeAnnotations) {
        const totalH = layers.reduce((s, curr) => s + curr.thickness, 0);
        const textColor = '#000'; // Force black text as requested
        const fontSize = settings.annotationFontSize || 12;

        // Model Dimensions
        const dist = settings.annotationDistance || 2;
        const dimPoints = [
          { start: new THREE.Vector3(-settings.length/2, -totalH/2 - 2, settings.width/2 + dist), end: new THREE.Vector3(settings.length/2, -totalH/2 - 2, settings.width/2 + dist), label: `${settings.length}${settings.unit}` },
          { start: new THREE.Vector3(-settings.length/2 - dist, -totalH/2 - 2, -settings.width/2), end: new THREE.Vector3(-settings.length/2 - dist, -totalH/2 - 2, settings.width/2), label: `${settings.width}${settings.unit}` },
          { start: new THREE.Vector3(-settings.length/2 - dist, -totalH/2 - 2, -settings.width/2 - dist), end: new THREE.Vector3(-settings.length/2 - dist, totalH/2 + 2, -settings.width/2 - dist), label: `${totalH.toFixed(1)}${settings.unit}` }
        ];

        dimPoints.forEach(dim => {
          const p1 = project(dim.start);
          const p2 = project(dim.end);
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          svgContent += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${textColor}" stroke-width="1" />`;
          svgContent += `<text x="${mid.x}" y="${mid.y - 5}" fill="${textColor}" font-size="${fontSize}" text-anchor="middle" font-family="${settings.fontFamily === 'SimSun' ? 'SimSun, 宋体' : 'Times New Roman'}">${dim.label}</text>`;
        });

        // Layer Annotations
        const isFront = settings.annotationSide === 'front';
        const basePositions = layers.map((layer, idx) => {
          const tanDip = Math.tan(THREE.MathUtils.degToRad(settings.dip));
          const dirRad = THREE.MathUtils.degToRad(settings.dipDirection);
          const corners = [
            { x: -settings.length / 2, z: -settings.width / 2 },
            { x: settings.length / 2, z: -settings.width / 2 },
            { x: -settings.length / 2, z: settings.width / 2 },
            { x: settings.length / 2, z: settings.width / 2 },
          ];
          const minShear = Math.min(...corners.map(c => c.x * tanDip * Math.cos(dirRad) + c.z * tanDip * Math.sin(dirRad)));
          
          const x = settings.length / 2;
          const z = isFront ? settings.width / 2 : 0;
          const shearYAdj = (x * tanDip * Math.cos(dirRad) + z * tanDip * Math.sin(dirRad)) - minShear;
          
          const layersBelow = layers.slice(idx + 1);
          const thicknessBelow = layersBelow.reduce((sum, l) => sum + l.thickness, 0);
          
          let prevCustomY = 0;
          layersBelow.forEach(prevLayer => {
            if (prevLayer.vertexOffsets) {
              const isLeft = x < 0;
              let vIdx = -1;
              if (isLeft && z < 0) vIdx = 0;
              else if (!isLeft && z < 0) vIdx = 1;
              else if (isLeft && z >= 0) vIdx = 2;
              else if (!isLeft && z >= 0) vIdx = 3;
              if (vIdx !== -1) prevCustomY += prevLayer.vertexOffsets[vIdx] || 0;
            }
          });

          const yPos = -totalH / 2 + thicknessBelow + layer.thickness / 2 + shearYAdj + prevCustomY;
          return { layer, baseStart: new THREE.Vector3(x, yPos, z) };
        });

        const sortedBases = [...basePositions].reverse();
        
        // Stacking logic for SVG using projected Y coordinates
        const minPixelGap = fontSize * 1.5;
        const horizontalStart = (isFront ? settings.width / 2 : settings.length / 2) + settings.annotationDistance / 4;
        const horizontalEnd = (isFront ? settings.width / 2 : settings.length / 2) + settings.annotationDistance / 2;

        // Corrected stacking loop for SVG
        const svgAnnotations = sortedBases.map(item => {
          const offset = item.layer.annotationOffset || { x: 0, y: 0, z: 0 };
          const pBase = project(item.baseStart);
          return { ...item, pBase, offset };
        }).sort((a, b) => a.pBase.y - b.pBase.y); // Sort by screen Y (top to bottom)

        let lastY = -Infinity;
        svgAnnotations.forEach((item) => {
          let currentY = item.pBase.y;
          if (currentY < lastY + minPixelGap) {
            currentY = lastY + minPixelGap;
          }
          lastY = currentY;

          // Calculate projected X for bend and end points
          const bendWorld = new THREE.Vector3(
            isFront ? item.baseStart.x + item.offset.x : horizontalStart + item.offset.x,
            item.baseStart.y, 
            isFront ? horizontalStart + item.offset.z : item.baseStart.z + item.offset.z
          );
          const endWorld = new THREE.Vector3(
            isFront ? item.baseStart.x + item.offset.x : horizontalEnd + item.offset.x,
            item.baseStart.y,
            isFront ? horizontalEnd + item.offset.z : item.baseStart.z + item.offset.z
          );

          const pBendRaw = project(bendWorld);
          const pEndRaw = project(endWorld);

          // Use the adjusted screen Y to keep the line horizontal
          const pStart = item.pBase;
          const pBend = { x: pBendRaw.x, y: currentY };
          const pEnd = { x: pEndRaw.x, y: currentY };
          
          const layerLabel = item.layer.name + (settings.showThickness ? ` (${item.layer.thickness}${settings.unit})` : '');
          
          svgContent += `<polyline points="${pStart.x},${pStart.y} ${pBend.x},${pBend.y} ${pEnd.x},${pEnd.y}" fill="none" stroke="${textColor}" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svgContent += `<text x="${pEnd.x + 5}" y="${pEnd.y + fontSize/3}" fill="${textColor}" font-size="${fontSize}" font-family="${settings.fontFamily === 'SimSun' ? 'SimSun, 宋体' : 'Times New Roman'}">${layerLabel}</text>`;
        });
      }

      svgContent += '</svg>';
      return svgContent;
    }
  }));

  return null;
});

// Annotations Component
const Annotations = ({ layers, settings, onUpdateLayer, designMode }: { layers: GeologicalLayer[], settings: ModelSettings, onUpdateLayer?: (id: string, updates: Partial<GeologicalLayer>) => void, designMode: boolean }) => {
  const totalHeight = useMemo(() => layers.reduce((sum, layer) => sum + layer.thickness, 0), [layers]);
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { camera, gl, controls } = useThree() as any;
  const [dynamicGap, setDynamicGap] = useState(0.5);

  // Update dynamic gap based on camera distance to maintain screen-space spacing
  useFrame(() => {
    if (!camera) return;
    const dist = camera.position.length();
    const fov = (camera as THREE.PerspectiveCamera).fov || 45;
    const height = gl.domElement.clientHeight || 500;
    
    // Calculate world units per pixel at the current distance
    const unitsPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * dist) / height;
    // We want a gap of roughly 1.5x the font size in pixels to be safe
    const targetGap = settings.annotationFontSize * 1.5 * unitsPerPixel;
    
    // Only update if change is significant to avoid excessive re-renders
    if (Math.abs(targetGap - dynamicGap) > dynamicGap * 0.01) {
      setDynamicGap(targetGap);
    }
  });

  const handlePointerDown = (e: any, id: string) => {
    if (!designMode) return;
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
    setDraggingId(id);
  };

  const handlePointerMove = (e: any, id: string, basePos: THREE.Vector3) => {
    if (draggingId !== id || !onUpdateLayer) return;
    e.stopPropagation();
    
    const plane = new THREE.Plane();
    const handlePos = new THREE.Vector3();
    e.object.getWorldPosition(handlePos);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), handlePos);
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (e.clientX / gl.domElement.clientWidth) * 2 - 1,
      -(e.clientY / gl.domElement.clientHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    
    const intersectPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
      onUpdateLayer(id, {
        annotationOffset: {
          x: intersectPoint.x - basePos.x,
          y: intersectPoint.y - basePos.y,
          z: intersectPoint.z - basePos.z
        }
      });
    }
  };

  const handlePointerUp = (e: any) => {
    if (draggingId) {
      e.target.releasePointerCapture(e.pointerId);
      if (controls) controls.enabled = true;
      setDraggingId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const fontStyle = {
    fontFamily: settings.fontFamily === 'SimSun' ? 'SimSun, 宋体, serif' : 'Times New Roman, serif',
    fontSize: `${settings.annotationFontSize}px`,
    color: settings.backgroundMode === 'day' ? '#000' : '#fff',
  };

  // Calculate staggered vertical offsets for layer labels to avoid overlap
  const staggeredLayers = useMemo(() => {
    const results: { layer: GeologicalLayer, baseStart: THREE.Vector3, bendPoint: THREE.Vector3, anchorPos: THREE.Vector3 }[] = [];
    const isFront = settings.annotationSide === 'front';

    // Calculate base positions first
    const basePositions = layers.map((layer, idx) => {
      const tanDip = Math.tan(THREE.MathUtils.degToRad(settings.dip));
      const dirRad = THREE.MathUtils.degToRad(settings.dipDirection);
      const corners = [
        { x: -settings.length / 2, z: -settings.width / 2 },
        { x: settings.length / 2, z: -settings.width / 2 },
        { x: -settings.length / 2, z: settings.width / 2 },
        { x: settings.length / 2, z: settings.width / 2 },
      ];
      const minShear = Math.min(...corners.map(c => c.x * tanDip * Math.cos(dirRad) + c.z * tanDip * Math.sin(dirRad)));
      
      const x = settings.length / 2;
      const z = isFront ? settings.width / 2 : 0;
      const shearYAdj = (x * tanDip * Math.cos(dirRad) + z * tanDip * Math.sin(dirRad)) - minShear;
      
      const layersBelow = layers.slice(idx + 1);
      const thicknessBelow = layersBelow.reduce((sum, l) => sum + l.thickness, 0);
      
      let prevCustomY = 0;
      layersBelow.forEach(prevLayer => {
        if (prevLayer.vertexOffsets) {
          const isLeft = x < 0;
          let vIdx = -1;
          if (isLeft && z < 0) vIdx = 0;
          else if (!isLeft && z < 0) vIdx = 1;
          else if (isLeft && z >= 0) vIdx = 2;
          else if (!isLeft && z >= 0) vIdx = 3;
          if (vIdx !== -1) prevCustomY += prevLayer.vertexOffsets[vIdx] || 0;
        }
      });

      const yPos = -totalHeight / 2 + thicknessBelow + layer.thickness / 2 + shearYAdj + prevCustomY;
      return { layer, baseStart: new THREE.Vector3(x, yPos, z) };
    });

    // Apply stacking logic: ensure minimum vertical gap
    const sortedBases = [...basePositions].reverse();
    // Use the dynamic gap calculated from screen-space requirements
    const minWorldGap = dynamicGap; 
    let lastY = -Infinity;
    
    // Fixed horizontal alignment for all labels
    const horizontalStart = (isFront ? settings.width / 2 : settings.length / 2) + settings.annotationDistance / 4;
    const horizontalEnd = (isFront ? settings.width / 2 : settings.length / 2) + settings.annotationDistance / 2;

    const stacked = sortedBases.map((item) => {
      const offset = item.layer.annotationOffset || { x: 0, y: 0, z: 0 };
      
      let targetY = item.baseStart.y + offset.y;
      // Ensure we maintain the dynamic gap in world space to keep pixels constant
      if (targetY < lastY + minWorldGap) {
        targetY = lastY + minWorldGap;
      }
      lastY = targetY;

      const bendPoint = new THREE.Vector3(
        isFront ? item.baseStart.x + offset.x : horizontalStart + offset.x,
        targetY,
        isFront ? horizontalStart + offset.z : item.baseStart.z + offset.z
      );

      const anchorPos = new THREE.Vector3(
        isFront ? item.baseStart.x + offset.x : horizontalEnd + offset.x, 
        targetY, 
        isFront ? horizontalEnd + offset.z : item.baseStart.z + offset.z
      );
      
      return { ...item, bendPoint, anchorPos };
    });

    // Return in original order
    return stacked.reverse();
  }, [layers, settings, totalHeight, dynamicGap]);

  return (
    <group>
      {/* Model Dimensions */}
      <group position={[0, -totalHeight/2 - 2, 0]}>
        {/* Length Line */}
        <Line 
          points={[[-settings.length/2, 0, settings.width/2 + 2], [settings.length/2, 0, settings.width/2 + 2]]}
          color={settings.backgroundMode === 'day' ? "#000" : "#fff"}
          lineWidth={3}
        />
        <Html position={[0, -0.5, settings.width/2 + 2.5]} center>
          <div style={fontStyle} className="whitespace-nowrap pointer-events-none">
            {settings.length}{settings.unit}
          </div>
        </Html>

        {/* Width Line */}
        <Line 
          points={[[-settings.length/2 - 2, 0, -settings.width/2], [-settings.length/2 - 2, 0, settings.width/2]]}
          color={settings.backgroundMode === 'day' ? "#000" : "#fff"}
          lineWidth={3}
        />
        <Html position={[-settings.length/2 - 2.5, -0.5, 0]} center>
          <div style={fontStyle} className="whitespace-nowrap pointer-events-none">
            {settings.width}{settings.unit}
          </div>
        </Html>

        {/* Height Line */}
        <Line 
          points={[[-settings.length/2 - 2, 0, -settings.width/2 - 2], [-settings.length/2 - 2, totalHeight, -settings.width/2 - 2]]}
          color={settings.backgroundMode === 'day' ? "#000" : "#fff"}
          lineWidth={3}
        />
        <Html position={[-settings.length/2 - 2.5, totalHeight/2, -settings.width/2 - 2.5]} center>
          <div style={fontStyle} className="whitespace-nowrap pointer-events-none">
            {totalHeight.toFixed(1)}{settings.unit}
          </div>
        </Html>
      </group>

      {/* Layer Annotations */}
      {staggeredLayers.map((item) => {
        const { layer, baseStart, bendPoint, anchorPos } = item;
        
        return (
          <group key={layer.id}>
            {/* Bent Lead Line */}
            <Line 
              points={[baseStart, bendPoint, anchorPos]} 
              color={settings.backgroundMode === 'day' ? "#333" : "#ccc"} 
              lineWidth={1} 
              transparent
              opacity={0.8}
              depthTest={false}
            />
            <Html 
              position={[anchorPos.x, anchorPos.y, anchorPos.z]} 
            >
              <div 
                style={{
                  ...fontStyle,
                  transform: 'translate(4px, -50%)',
                  pointerEvents: draggingId === layer.id ? 'none' : 'auto',
                }}
                className="whitespace-nowrap flex items-center gap-2"
              >
                {designMode && (
                  <div 
                    className="w-3 h-3 bg-blue-500 rounded-full cursor-move shrink-0 shadow-sm"
                    onPointerDown={(e) => handlePointerDown(e, layer.id)}
                    onPointerMove={(e) => handlePointerMove(e, layer.id, baseStart)}
                    onPointerUp={handlePointerUp}
                  />
                )}
                <span className="bg-slate-900/5 dark:bg-slate-100/5 px-1 rounded">
                  {layer.name}{settings.showThickness ? ` (${layer.thickness}${settings.unit})` : ''}
                </span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
};

export const Viewer = forwardRef<ViewerRef, ViewerProps>(({ layers, settings, selectedLayerId, onHoverLayer, onSelectLayer, onUpdateLayer }, ref) => {
  const totalHeight = useMemo(() => layers.reduce((sum, layer) => sum + layer.thickness, 0), [layers]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate ideal camera distance based on model size
  const maxDim = Math.max(settings.length, settings.width, totalHeight);
  const cameraDist = maxDim * 1.5;

  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleVertexUpdate = (layerId: string, vertexIndex: number, offset: number) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    const newOffsets = [...(layer.vertexOffsets || [0, 0, 0, 0])];
    newOffsets[vertexIndex] = offset;
    onUpdateLayer?.(layerId, { vertexOffsets: newOffsets });
  };

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full relative transition-colors duration-500 ${
        settings.backgroundMode === 'day' ? 'bg-slate-100' : 'bg-slate-900'
      }`}
    >
      <Canvas 
        shadows 
        dpr={[1, 2]} 
        gl={{ 
          antialias: true, 
          preserveDrawingBuffer: true,
          logarithmicDepthBuffer: true
        }}
        onPointerMissed={() => onSelectLayer(null)}
      >
        <PerspectiveCamera 
          makeDefault 
          position={[cameraDist, cameraDist, cameraDist]} 
          fov={45} 
          near={0.1} 
          far={Math.max(10000, cameraDist * 10)} 
        />
        <OrbitControls 
          makeDefault 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI}
          mouseButtons={{
            LEFT: isCtrlPressed ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          }}
        />
        <CameraController 
          ref={ref} 
          onDeselect={() => onSelectLayer(null)} 
          layers={layers} 
          settings={settings} 
          containerRef={containerRef}
        />
        
        <ambientLight intensity={settings.backgroundMode === 'day' ? 1.0 : 0.6} />
        <directionalLight 
          position={[cameraDist, cameraDist, cameraDist]} 
          intensity={settings.backgroundMode === 'day' ? 1.2 : 0.8} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight 
          position={[-cameraDist, cameraDist, -cameraDist]} 
          intensity={settings.backgroundMode === 'day' ? 0.8 : 0.5} 
        />
        <hemisphereLight
          intensity={0.5}
          color="#ffffff"
          groundColor="#444444"
        />
        
        <group position={[0, 0, 0]}>
          {/* Annotations */}
          {settings.includeAnnotations && (
            <Annotations 
              layers={layers} 
              settings={settings} 
              onUpdateLayer={onUpdateLayer} 
              designMode={settings.designMode}
            />
          )}
          {/* Coordinate Axes Helper */}
          {settings.designMode && (
            <group position={[-settings.length/2 - 2, -totalHeight/2, -settings.width/2 - 2]}>
              <mesh position={[1, 0, 0]}>
                <boxGeometry args={[2, 0.1, 0.1]} />
                <meshBasicMaterial color="red" />
              </mesh>
              <mesh position={[0, 1, 0]}>
                <boxGeometry args={[0.1, 2, 0.1]} />
                <meshBasicMaterial color="green" />
              </mesh>
              <mesh position={[0, 0, 1]}>
                <boxGeometry args={[0.1, 0.1, 2]} />
                <meshBasicMaterial color="blue" />
              </mesh>
              <Html position={[2, 0, 0]}><div className="text-[8px] text-red-500 font-bold">X (长)</div></Html>
              <Html position={[0, 2, 0]}><div className="text-[8px] text-green-500 font-bold">Y (高)</div></Html>
              <Html position={[0, 0, 2]}><div className="text-[8px] text-blue-500 font-bold">Z (宽)</div></Html>
            </group>
          )}

          {layers.map((layer, index) => (
            <LayerMesh
              key={layer.id}
              layer={layer}
              index={index}
              allLayers={layers}
              settings={settings}
              onHover={onHoverLayer}
              onClick={(l) => onSelectLayer(l)}
              isSelected={selectedLayerId === layer.id}
              onVertexUpdate={handleVertexUpdate}
            />
          ))}

          {/* Excavations - Rendered as "cut-outs" (black boxes for now) */}
          {settings.excavations.map(ex => (
            <group key={ex.id} position={[ex.position.x, ex.position.y, ex.position.z]}>
              <mesh>
                <boxGeometry args={[ex.size.x, ex.size.y, ex.size.z]} />
                <meshStandardMaterial color="#000000" emissive="#ff0000" emissiveIntensity={0.1} />
              </mesh>
              <Html distanceFactor={10}>
                <div className="bg-red-900/80 text-white text-[8px] px-1 rounded border border-red-500 whitespace-nowrap">
                  巷道: ({ex.position.x}, {ex.position.y}, {ex.position.z})
                </div>
              </Html>
            </group>
          ))}
        </group>

        {settings.showGrid && (
          <Grid
            infiniteGrid
            fadeDistance={Math.max(100, cameraDist * 2)}
            fadeStrength={5}
            cellSize={Math.max(1, Math.floor(maxDim / 100))}
            sectionSize={Math.max(10, Math.floor(maxDim / 10))}
            sectionColor="#334155"
            cellColor="#1e293b"
            position={[0, -totalHeight/2 - 2, 0]}
          />
        )}
      </Canvas>
      
      <div className="absolute bottom-4 left-4 text-white/30 text-[10px] font-mono pointer-events-none uppercase tracking-widest">
        Geological Modeling System v2.0
      </div>
    </div>
  );
});
