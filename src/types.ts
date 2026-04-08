export interface SimulationData {
  lithology: string; // 岩性
  simRelativeHeight: number; // 模拟相对高度
  sandPercent: number; // 沙子/%
  calciumPercent: number; // 碳酸钙/%
  gypsumPercent: number; // 石膏/%
  density: number; // 密度 (kg/m^3 or similar for calculation)
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Fault {
  id: string;
  lineStart: Vector3; // 断层线起点
  lineEnd: Vector3;   // 断层线终点
  offset: number;     // 位移量 (正为抬升，负为下沉)
  side: 'left' | 'right'; // 哪一侧移动
}

export interface Excavation {
  id: string;
  type: 'tunnel' | 'chamber';
  position: Vector3;
  size: Vector3;
}

export interface GeologicalLayer {
  id: string;
  name: string;
  thickness: number;
  color: string;
  opacity: number;
  vertexOffsets?: number[]; // 4个顶点的Y轴偏移量 [TL, TR, BL, BR]
  annotationOffset?: Vector3; // 标注文字的偏移量
}

export interface ModelSettings {
  length: number; // 原型长度 (m)
  width: number; // 原型宽度 (m)
  dip: number; // 全局倾角
  dipDirection: number; // 倾斜方向 (0-360)
  showGrid: boolean;
  wireframe: boolean;
  designMode: boolean;
  backgroundMode: 'day' | 'night';
  includeAnnotations: boolean;
  annotationFontSize: number;
  annotationDistance: number; // 标注距离模型的距离
  showThickness: boolean; // 是否显示厚度
  unit: string; // 单位 (如 m, cm)
  fontFamily: 'SimSun' | 'Times New Roman';
  annotationSide: 'side' | 'front'; // 标注位置: 侧面或正面
  faults: Fault[];
  excavations: Excavation[];
}
