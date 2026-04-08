import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Viewer, ViewerRef } from './components/Viewer';
import { GeologicalLayer, ModelSettings } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Maximize2, Download, Camera, Box, Compass } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

const DEFAULT_LAYERS: GeologicalLayer[] = [
  { 
    id: '1', name: '表层土', thickness: 1, color: '#8B4513', opacity: 1,
    vertexOffsets: [0, 0, 0, 0]
  },
  { 
    id: '2', name: '砂岩层', thickness: 3, color: '#F4A460', opacity: 1,
    vertexOffsets: [0, 0, 0, 0]
  },
  { 
    id: '3', name: '页岩层', thickness: 2, color: '#708090', opacity: 1,
    vertexOffsets: [0, 0, 0, 0]
  },
  { 
    id: '4', name: '石灰岩', thickness: 4, color: '#D3D3D3', opacity: 1,
    vertexOffsets: [0, 0, 0, 0]
  },
  { 
    id: '5', name: '基岩', thickness: 5, color: '#2F4F4F', opacity: 1,
    vertexOffsets: [0, 0, 0, 0]
  },
];

const DEFAULT_SETTINGS: ModelSettings = {
  length: 100, // 默认原型长度 100m
  width: 20,   // 默认原型宽度 20m
  dip: 15,
  dipDirection: 0,
  showGrid: true,
  wireframe: false,
  designMode: false,
  backgroundMode: 'night',
  includeAnnotations: false,
  annotationFontSize: 12,
  annotationDistance: 5,
  showThickness: true,
  unit: 'm',
  fontFamily: 'SimSun',
  annotationSide: 'side',
  faults: [],
  excavations: [],
};

export default function App() {
  const [layers, setLayers] = useState<GeologicalLayer[]>(DEFAULT_LAYERS);
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_SETTINGS);
  const [hoveredLayer, setHoveredLayer] = useState<GeologicalLayer | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const viewerRef = useRef<ViewerRef>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleExportJSON = useCallback(() => {
    const data = JSON.stringify({ layers, settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    saveAs(blob, `地质模型-${new Date().toISOString().split('T')[0]}.json`);
  }, [layers, settings]);

  const handleExportCSV = useCallback(() => {
    const headers = ['ID', '名称', '厚度(m)', '颜色', 'TL偏移', 'TR偏移', 'BL偏移', 'BR偏移'];
    const rows = layers.map(l => [
      l.id,
      l.name,
      l.thickness,
      l.color,
      l.vertexOffsets?.[0] || 0,
      l.vertexOffsets?.[1] || 0,
      l.vertexOffsets?.[2] || 0,
      l.vertexOffsets?.[3] || 0,
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `地质模型数据-${new Date().toISOString().split('T')[0]}.csv`);
  }, [layers]);

  const handleExportExcel = useCallback(() => {
    const data = layers.map(l => ({
      'ID': l.id,
      '名称': l.name,
      '厚度(m)': l.thickness,
      '颜色': l.color,
      'TL偏移(m)': l.vertexOffsets?.[0] || 0,
      'TR偏移(m)': l.vertexOffsets?.[1] || 0,
      'BL偏移(m)': l.vertexOffsets?.[2] || 0,
      'BR偏移(m)': l.vertexOffsets?.[3] || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "地质层数据");
    
    // Settings sheet
    const settingsData = [
      { '参数': '原型长度 (m)', '数值': settings.length },
      { '参数': '原型宽度 (m)', '数值': settings.width },
      { '参数': '全局倾角 (°)', '数值': settings.dip },
      { '参数': '倾斜方向 (°)', '数值': settings.dipDirection },
    ];
    const wsSettings = XLSX.utils.json_to_sheet(settingsData);
    XLSX.utils.book_append_sheet(wb, wsSettings, "模型设置");

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `地质模型数据-${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [layers, settings]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (!content) {
        setNotification({ message: "文件内容为空", type: 'error' });
        return;
      }

      try {
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(content as string);
          if (data.settings) setSettings(data.settings);
          if (data.layers) setLayers(data.layers);
          setNotification({ message: "JSON 模型导入成功", type: 'success' });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(content, { type: 'binary' });
          
          // Read Layers
          const layersSheet = workbook.Sheets["地质层数据"];
          if (layersSheet) {
            const importedLayers = XLSX.utils.sheet_to_json(layersSheet) as any[];
            const formattedLayers: GeologicalLayer[] = importedLayers.map((l, idx) => ({
              id: l.ID || Math.random().toString(36).substr(2, 9),
              name: l.名称 || `导入层 ${idx + 1}`,
              thickness: Number(l['厚度(m)']) || 1,
              color: l.颜色 || "#cccccc",
              opacity: 1,
              vertexOffsets: [
                Number(l['TL偏移(m)']) || 0,
                Number(l['TR偏移(m)']) || 0,
                Number(l['BL偏移(m)']) || 0,
                Number(l['BR偏移(m)']) || 0
              ]
            }));
            setLayers(formattedLayers);
          }

          // Read Settings from "模型设置" (Sheet2)
          const settingsSheet = workbook.Sheets["模型设置"];
          if (settingsSheet) {
            const importedSettings = XLSX.utils.sheet_to_json(settingsSheet) as any[];
            const newSettings = { ...settings };
            importedSettings.forEach((row: any) => {
              if (row['参数'] === '原型长度 (m)') newSettings.length = Number(row['数值']);
              if (row['参数'] === '原型宽度 (m)') newSettings.width = Number(row['数值']);
              if (row['参数'] === '全局倾角 (°)') newSettings.dip = Number(row['数值']);
              if (row['参数'] === '倾斜方向 (°)') newSettings.dipDirection = Number(row['数值']);
            });
            setSettings(newSettings);
          }

          if (layersSheet || settingsSheet) {
            setNotification({ message: "Excel 模型数据导入成功", type: 'success' });
          } else {
            setNotification({ message: "Excel 格式错误：未找到有效数据表", type: 'error' });
          }
        } else if (file.name.endsWith('.csv')) {
          const lines = (content as string).split('\n');
          const formattedLayers: GeologicalLayer[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 4) continue;
            formattedLayers.push({
              id: cols[0] || Math.random().toString(36).substr(2, 9),
              name: cols[1] || `导入层 ${i}`,
              thickness: Number(cols[2]) || 1,
              color: cols[3] || "#cccccc",
              opacity: 1,
              vertexOffsets: [
                Number(cols[4]) || 0,
                Number(cols[5]) || 0,
                Number(cols[6]) || 0,
                Number(cols[7]) || 0
              ]
            });
          }
          if (formattedLayers.length > 0) {
            setLayers(formattedLayers);
            setNotification({ message: `CSV 模型导入成功 (${formattedLayers.length} 层)`, type: 'success' });
          } else {
            setNotification({ message: "CSV 格式错误：未读取到有效数据", type: 'error' });
          }
        }
      } catch (err) {
        console.error(err);
        setNotification({ message: `导入失败: ${err instanceof Error ? err.message : '未知错误'}`, type: 'error' });
      }
      
      // Reset input
      e.target.value = '';
    };

    reader.onerror = () => {
      setNotification({ message: "文件读取失败", type: 'error' });
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  }, []);

  const handleScreenshot = useCallback(async (view?: 'top' | 'front' | 'side' | 'iso', scale = 1) => {
    if (!viewerRef.current) return null;
    
    if (view) {
      viewerRef.current.setCameraView(view);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    const dataUrl = await viewerRef.current.takeScreenshot(scale);
    if (!view) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `地质模型-当前视角-${scale > 1 ? '高分辨率-' : ''}${new Date().getTime()}.png`;
      a.click();
    }
    return dataUrl;
  }, []);

  const handleScreenshotAll = useCallback(async () => {
    if (!viewerRef.current) return;
    
    const zip = new JSZip();
    const views: ('iso' | 'top' | 'front' | 'side')[] = ['iso', 'top', 'front', 'side'];
    
    for (const view of views) {
      const dataUrl = await handleScreenshot(view, 2); // Use 2x scale for zip to balance quality/size
      if (dataUrl) {
        const base64Data = dataUrl.split(',')[1];
        zip.file(`地质模型-${view}.png`, base64Data, { base64: true });
      }
    }
    
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `地质模型-全视角图片-${new Date().getTime()}.zip`);
  }, [handleScreenshot]);

  const handleExportSVG = useCallback(async () => {
    if (!viewerRef.current) return;
    const svgContent = viewerRef.current.exportVectorSVG(layers, settings);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    saveAs(blob, `地质模型-矢量图-${new Date().getTime()}.svg`);
  }, [layers, settings]);

  const handleScreenshotHighRes = useCallback(async () => {
    await handleScreenshot(undefined, 4); // 4x scale for high-res (approx 600 DPI equivalent)
  }, [handleScreenshot]);

  const handleSelectLayer = (layer: GeologicalLayer | null) => {
    setSelectedLayerId(layer ? layer.id : null);
  };

  const setView = (view: 'top' | 'front' | 'side' | 'iso') => {
    viewerRef.current?.setCameraView(view);
  };

  useEffect(() => {
    (window as any).handleScreenshot = () => handleScreenshot();
    (window as any).handleScreenshotHighRes = () => handleScreenshotHighRes();
    (window as any).handleScreenshotAll = () => handleScreenshotAll();
    (window as any).handleExportJSON = () => handleExportJSON();
    (window as any).handleExportCSV = () => handleExportCSV();
    (window as any).handleExportExcel = () => handleExportExcel();
    (window as any).handleExportSVG = () => handleExportSVG();
  }, [handleScreenshot, handleScreenshotHighRes, handleScreenshotAll, handleExportJSON, handleExportCSV, handleExportExcel, handleExportSVG]);

  return (
    <div className="flex h-screen w-screen bg-slate-950 font-sans overflow-hidden">
      <Sidebar 
        layers={layers} 
        setLayers={setLayers} 
        settings={settings} 
        setSettings={setSettings}
        onImport={handleImport}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onExportExcel={handleExportExcel}
        onScreenshot={() => handleScreenshot()}
        onScreenshotHighRes={handleScreenshotHighRes}
        onScreenshotAll={handleScreenshotAll}
        onExportSVG={handleExportSVG}
        selectedLayerId={selectedLayerId}
        setSelectedLayerId={setSelectedLayerId}
      />
      
      <main className="flex-1 relative">
        <Viewer 
          ref={viewerRef}
          layers={layers} 
          settings={settings} 
          selectedLayerId={selectedLayerId}
          onHoverLayer={setHoveredLayer}
          onSelectLayer={handleSelectLayer}
          onUpdateLayer={(id, updates) => setLayers(layers.map(l => l.id === id ? { ...l, ...updates } : l))}
        />

        {/* Overlay UI */}
        <AnimatePresence>
          {hoveredLayer && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute top-6 right-6 z-10"
            >
              <div className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl p-4 shadow-2xl min-w-[200px]">
                <div className="flex items-center gap-3 mb-3">
                  <div 
                    className="w-3 h-3 rounded-full shadow-sm" 
                    style={{ backgroundColor: hoveredLayer.color }} 
                  />
                  <h3 className="text-white font-semibold">{hoveredLayer.name}</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">厚度</span>
                    <span className="text-white font-mono">{hoveredLayer.thickness}m</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View Controls */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-full p-1 shadow-2xl">
          {[
            { id: 'iso', label: '等轴测', icon: Box },
            { id: 'top', label: '顶视', icon: Compass },
            { id: 'front', label: '正视', icon: Camera },
            { id: 'side', label: '侧视', icon: Maximize2 },
          ].map((view) => (
            <button
              key={view.id}
              onClick={() => setView(view.id as any)}
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-700 rounded-full transition-all text-slate-300 hover:text-white text-xs font-medium"
            >
              <view.icon className="w-3.5 h-3.5" />
              {view.label}
            </button>
          ))}
          <div className="w-px h-6 bg-slate-800 self-center mx-1" />
          <button
            onClick={() => handleScreenshot()}
            className="flex items-center gap-2 px-4 py-2 hover:bg-blue-600 rounded-full transition-all text-blue-400 hover:text-white text-xs font-medium"
          >
            <Camera className="w-3.5 h-3.5" />
            截图
          </button>
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-3">
          <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-full p-1.5 flex flex-col gap-2 shadow-lg">
            <button 
              className="p-2.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
              title={settings.backgroundMode === 'day' ? "切换到夜间模式" : "切换到日间模式"}
              onClick={() => setSettings(s => ({ ...s, backgroundMode: s.backgroundMode === 'day' ? 'night' : 'day' }))}
            >
              <Box className={`w-5 h-5 ${settings.backgroundMode === 'day' ? 'text-amber-500' : 'text-blue-400'}`} />
            </button>
            <button 
              className="p-2.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
              title="导出各视角图片"
              onClick={async () => {
                await handleScreenshot('iso');
                await handleScreenshot('top');
                await handleScreenshot('front');
                await handleScreenshot('side');
              }}
            >
              <Download className="w-5 h-5" />
            </button>
            <button 
              className="p-2.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
              title={isFullscreen ? "退出全屏" : "全屏模式"}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Box className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute top-6 left-6 flex flex-col gap-4">
          <div className="bg-slate-900/40 backdrop-blur border border-slate-800/50 rounded-lg p-3 pointer-events-none">
            <div className="flex items-center gap-2 text-slate-300 text-sm font-medium mb-2">
              <Info className="w-4 h-4" />
              模型信息
            </div>
            <div className="text-[10px] text-slate-500 font-mono space-y-1">
              <div>长度: {settings.length}m</div>
              <div>宽度: {settings.width}m</div>
              <div>倾角: {settings.dip}°</div>
              <div>总层数: {layers.length}</div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`absolute bottom-24 left-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl backdrop-blur ${
                notification.type === 'success' 
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                  : 'bg-red-500/20 border-red-500/50 text-red-400'
              }`}
            >
              <Info className="w-5 h-5" />
              <div className="text-sm font-medium">{notification.message}</div>
              <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
                <Maximize2 className="w-4 h-4 rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
