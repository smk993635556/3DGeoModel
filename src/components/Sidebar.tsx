import React from 'react';
import { Plus, Trash2, Layers, Settings2, Maximize2, MousePointer2, Scissors, Box, Image as ImageIcon, Type, Download, Upload, FileJson, FileSpreadsheet, FileText, Camera, GripVertical, ArrowUpDown } from 'lucide-react';
import { GeologicalLayer, ModelSettings, Fault, Excavation } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableLayerItemProps {
  layer: GeologicalLayer;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<GeologicalLayer>) => void;
}

const SortableLayerItem: React.FC<SortableLayerItemProps> = ({ layer, isSelected, onSelect, onRemove, onUpdate }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(layer.id)}
      className={`p-3 rounded-lg border transition-all cursor-pointer group ${
        isDragging ? 'opacity-50 scale-105 shadow-2xl border-blue-500 bg-slate-800' :
        isSelected 
          ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1">
          <div 
            {...attributes} 
            {...listeners}
            className="p-1 -ml-1 hover:bg-slate-800 rounded cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
          <span className="text-sm text-white font-medium truncate">{layer.name}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(layer.id); }}
          className="p-1 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      
      {isSelected && !isDragging && (
        <div className="space-y-4 mt-4 pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">岩层名称</label>
              <input
                type="text"
                value={layer.name}
                onChange={(e) => onUpdate(layer.id, { name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">颜色</label>
              <input
                type="color"
                value={layer.color}
                onChange={(e) => onUpdate(layer.id, { color: e.target.value })}
                className="w-full h-7 bg-transparent border-none cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">厚度 / m</label>
              <input
                type="number"
                value={layer.thickness}
                onChange={(e) => onUpdate(layer.id, { thickness: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SidebarProps {
  layers: GeologicalLayer[];
  setLayers: React.Dispatch<React.SetStateAction<GeologicalLayer[]>>;
  settings: ModelSettings;
  setSettings: React.Dispatch<React.SetStateAction<ModelSettings>>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  onScreenshot: () => void;
  onScreenshotHighRes: () => void;
  onScreenshotAll: () => void;
  onExportSVG: () => void;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  layers, setLayers, settings, setSettings, 
  onImport, onExportJSON, onExportCSV, onExportExcel,
  onScreenshot, onScreenshotHighRes, onScreenshotAll, onExportSVG,
  selectedLayerId, setSelectedLayerId 
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layers.findIndex((l) => l.id === active.id);
      const newIndex = layers.findIndex((l) => l.id === over.id);
      setLayers(arrayMove(layers, oldIndex, newIndex));
    }
  };

  const reverseLayers = () => {
    setLayers([...layers].reverse());
  };

  const addLayer = () => {
    const newLayer: GeologicalLayer = {
      id: Math.random().toString(36).substr(2, 9),
      name: `新岩层 ${layers.length + 1}`,
      thickness: 2,
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      opacity: 1,
      vertexOffsets: [0, 0, 0, 0]
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const removeLayer = (id: string) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const updateLayer = (id: string, updates: Partial<GeologicalLayer>) => {
    setLayers(layers.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const addFault = () => {
    const newFault: Fault = {
      id: Math.random().toString(36).substr(2, 9),
      lineStart: { x: -settings.length / 2, y: 0, z: 0 },
      lineEnd: { x: settings.length / 2, y: 0, z: 0 },
      offset: 5,
      side: 'left'
    };
    setSettings({ ...settings, faults: [...settings.faults, newFault] });
  };

  const addExcavation = () => {
    const newExcavation: Excavation = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'tunnel',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 5, y: 5, z: settings.width }
    };
    setSettings({ ...settings, excavations: [...settings.excavations, newExcavation] });
  };

  return (
    <div className="w-96 h-full bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50">
        <h1 className="text-white font-semibold flex items-center gap-2 shrink-0">
          <Layers className="w-4 h-4 text-blue-400" />
          地质建模系统
        </h1>
        
        {/* Import/Export in the header area as requested */}
        <div className="flex items-center gap-1 flex-1 justify-end">
          <button 
            onClick={() => (document.getElementById('sidebar-import') as HTMLInputElement)?.click()}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 transition-colors"
            title="导入模型"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input id="sidebar-import" type="file" onChange={onImport} className="hidden" accept=".json,.csv,.xlsx,.xls" />

          <div className="relative group">
            <button className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-green-400 transition-colors">
              <Download className="w-3.5 h-3.5" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1.5 space-y-1">
              <div className="px-2 py-1 text-[9px] text-slate-500 font-bold uppercase">导出数据</div>
              <button onClick={onExportJSON} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <FileJson className="w-3 h-3 text-amber-400" /> JSON
              </button>
              <button onClick={onExportExcel} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <FileSpreadsheet className="w-3 h-3 text-green-500" /> Excel
              </button>
              <button onClick={onExportCSV} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <FileText className="w-3 h-3 text-blue-400" /> CSV
              </button>
              
              <div className="h-px bg-slate-800 my-1" />
              <div className="px-2 py-1 text-[9px] text-slate-500 font-bold uppercase">导出图片</div>
              <button onClick={onScreenshot} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <ImageIcon className="w-3 h-3" /> 标准 PNG
              </button>
              <button onClick={onScreenshotHighRes} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <Maximize2 className="w-3 h-3 text-amber-400" /> 高清 PNG
              </button>
              <button onClick={onExportSVG} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <Box className="w-3 h-3 text-blue-400" /> 矢量 SVG
              </button>
              <button onClick={onScreenshotAll} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded text-[10px] text-slate-300">
                <Camera className="w-3 h-3 text-purple-400" /> 全视角 (Zip)
              </button>
            </div>
          </div>

          <div className="w-px h-4 bg-slate-800 mx-1" />

          <button 
            onClick={() => setSettings({ ...settings, designMode: !settings.designMode })}
            className={`p-1.5 rounded transition-colors ${settings.designMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            title={settings.designMode ? "退出设计模式" : "进入设计模式"}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Design Mode Banner */}
        {settings.designMode && (
          <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-3 flex items-center gap-3 animate-pulse">
            <MousePointer2 className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-xs font-bold text-blue-400 uppercase">设计模式已开启</div>
              <div className="text-[10px] text-blue-300/70">点击模型顶点可修改坐标</div>
            </div>
          </div>
        )}

        {/* Model Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Settings2 className="w-3 h-3" />
            模型尺寸 (Dimensions)
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase">模型长度 / m</label>
              <input
                type="number"
                value={settings.length}
                onChange={(e) => setSettings({ ...settings, length: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase">模型宽度 / m</label>
              <input
                type="number"
                value={settings.width}
                onChange={(e) => setSettings({ ...settings, width: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase">全局倾角 / °</label>
              <input
                type="number"
                value={settings.dip}
                onChange={(e) => setSettings({ ...settings, dip: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase">倾斜方向 / °</label>
              <input
                type="number"
                value={settings.dipDirection}
                onChange={(e) => setSettings({ ...settings, dipDirection: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Display Settings */}
        <section className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <ImageIcon className="w-3 h-3" />
            显示设置
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-300">背景模式</span>
              <div className="flex bg-slate-950 rounded-md p-0.5 border border-slate-800">
                <button 
                  onClick={() => setSettings({ ...settings, backgroundMode: 'day' })}
                  className={`px-3 py-1 rounded text-[10px] transition-all ${settings.backgroundMode === 'day' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  日光
                </button>
                <button 
                  onClick={() => setSettings({ ...settings, backgroundMode: 'night' })}
                  className={`px-3 py-1 rounded text-[10px] transition-all ${settings.backgroundMode === 'night' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  夜光
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-300">显示网格</span>
              <button 
                onClick={() => setSettings({ ...settings, showGrid: !settings.showGrid })}
                className={`w-10 h-5 rounded-full transition-all relative ${settings.showGrid ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.showGrid ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-300">显示标注</span>
              <button 
                onClick={() => setSettings({ ...settings, includeAnnotations: !settings.includeAnnotations })}
                className={`w-10 h-5 rounded-full transition-all relative ${settings.includeAnnotations ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.includeAnnotations ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            {settings.includeAnnotations && (
              <div className="space-y-3 p-2 bg-slate-900/50 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] text-slate-400 uppercase">标注字体大小</label>
                    <span className="text-[10px] text-blue-400 font-mono">{settings.annotationFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="64"
                    step="1"
                    value={settings.annotationFontSize}
                    onChange={(e) => setSettings({ ...settings, annotationFontSize: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] text-slate-400 uppercase">标注距离</label>
                    <span className="text-[10px] text-blue-400 font-mono">{settings.annotationDistance}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="5"
                    value={settings.annotationDistance}
                    onChange={(e) => setSettings({ ...settings, annotationDistance: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase">显示厚度</span>
                  <button 
                    onClick={() => setSettings({ ...settings, showThickness: !settings.showThickness })}
                    className={`w-8 h-4 rounded-full transition-all relative ${settings.showThickness ? 'bg-blue-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${settings.showThickness ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase">显示单位</label>
                  <input
                    type="text"
                    value={settings.unit}
                    onChange={(e) => setSettings({ ...settings, unit: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-[10px] focus:outline-none focus:border-blue-500"
                    placeholder="如: m, cm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase">标注位置</label>
                  <div className="grid grid-cols-2 gap-1">
                    <button 
                      onClick={() => setSettings({ ...settings, annotationSide: 'side' })}
                      className={`px-2 py-1 rounded text-[10px] border transition-all ${settings.annotationSide === 'side' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                    >
                      侧面
                    </button>
                    <button 
                      onClick={() => setSettings({ ...settings, annotationSide: 'front' })}
                      className={`px-2 py-1 rounded text-[10px] border transition-all ${settings.annotationSide === 'front' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                    >
                      正面
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                    <Type className="w-3 h-3" /> 字体族
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <button 
                      onClick={() => setSettings({ ...settings, fontFamily: 'SimSun' })}
                      className={`px-2 py-1 rounded text-[10px] border transition-all ${settings.fontFamily === 'SimSun' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                    >
                      宋体
                    </button>
                    <button 
                      onClick={() => setSettings({ ...settings, fontFamily: 'Times New Roman' })}
                      className={`px-2 py-1 rounded text-[10px] border transition-all ${settings.fontFamily === 'Times New Roman' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                    >
                      Times New Roman
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Faults & Excavations */}
        {settings.designMode && (
          <section className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Scissors className="w-3 h-3" />
                断层设计
              </div>
              <button onClick={addFault} className="p-1 hover:bg-slate-800 rounded text-blue-400"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {settings.faults.map(fault => (
                <div key={fault.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">断层 ID: {fault.id}</span>
                    <button onClick={() => setSettings({...settings, faults: settings.faults.filter(f => f.id !== fault.id)})} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500">位移量 / m</label>
                      <input type="number" value={fault.offset} onChange={(e) => setSettings({...settings, faults: settings.faults.map(f => f.id === fault.id ? {...f, offset: Number(e.target.value)} : f)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500">侧向</label>
                      <select value={fault.side} onChange={(e) => setSettings({...settings, faults: settings.faults.map(f => f.id === fault.id ? {...f, side: e.target.value as any} : f)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs">
                        <option value="left">左侧</option>
                        <option value="right">右侧</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Box className="w-3 h-3" />
                巷道开挖
              </div>
              <button onClick={addExcavation} className="p-1 hover:bg-slate-800 rounded text-blue-400"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {settings.excavations.map(ex => (
                <div key={ex.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">巷道 ID: {ex.id}</span>
                    <button onClick={() => setSettings({...settings, excavations: settings.excavations.filter(e => e.id !== ex.id)})} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">中心位置 (X, Y, Z) / m</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-600">X (长度)</label>
                        <input type="number" value={ex.position.x} onChange={(e) => setSettings({...settings, excavations: settings.excavations.map(item => item.id === ex.id ? {...item, position: {...item.position, x: Number(e.target.value)}} : item)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-600">Y (高度)</label>
                        <input type="number" value={ex.position.y} onChange={(e) => setSettings({...settings, excavations: settings.excavations.map(item => item.id === ex.id ? {...item, position: {...item.position, y: Number(e.target.value)}} : item)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-600">Z (宽度)</label>
                        <input type="number" value={ex.position.z} onChange={(e) => setSettings({...settings, excavations: settings.excavations.map(item => item.id === ex.id ? {...item, position: {...item.position, z: Number(e.target.value)}} : item)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">尺寸 (长, 高, 宽) / m</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-600">L</label>
                        <input type="number" value={ex.size.x} onChange={(e) => setSettings({...settings, excavations: settings.excavations.map(item => item.id === ex.id ? {...item, size: {...item.size, x: Number(e.target.value)}} : item)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-600">H</label>
                        <input type="number" value={ex.size.y} onChange={(e) => setSettings({...settings, excavations: settings.excavations.map(item => item.id === ex.id ? {...item, size: {...item.size, y: Number(e.target.value)}} : item)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-600">W</label>
                        <input type="number" value={ex.size.z} onChange={(e) => setSettings({...settings, excavations: settings.excavations.map(item => item.id === ex.id ? {...item, size: {...item.size, z: Number(e.target.value)}} : item)})} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Layers List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <Layers className="w-3 h-3" />
              岩层列表 (从上到下)
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reverseLayers}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-amber-400 transition-colors"
                title="一键反转顺序"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={addLayer}
                className="p-1 hover:bg-slate-800 rounded text-blue-400 hover:text-blue-300 transition-colors"
                title="添加岩层"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-2">
              <SortableContext 
                items={layers.map(l => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {layers.map((layer) => (
                  <SortableLayerItem
                    key={layer.id}
                    layer={layer}
                    isSelected={selectedLayerId === layer.id}
                    onSelect={setSelectedLayerId}
                    onRemove={removeLayer}
                    onUpdate={updateLayer}
                  />
                ))}
              </SortableContext>
            </div>
          </DndContext>
        </section>
      </div>
    </div>
  );
};
