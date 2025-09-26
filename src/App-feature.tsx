import {
  Environment,
  OrbitControls,
  StatsGl,
  PerformanceMonitor,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Splat } from './splat-object';
import { Leva, useControls } from 'leva';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const urls = [
  'https://virtual-homes.s3.ap-south-1.amazonaws.com/VirtualHomes/SOGS_compression/Sattvasplat.splat'
];

// Enhanced device detection and capability assessment
const getDeviceCapabilities = () => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isTablet = /iPad|Android.*tablet/i.test(navigator.userAgent) && !isMobile;
  const dpr = window.devicePixelRatio || 1;
  const screenSize = window.innerWidth * window.innerHeight;
  
  // Get WebGL capabilities
  const maxTextureSize = gl?.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
  const maxRenderbufferSize = gl?.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2048;
  const maxFragmentUniforms = gl?.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 256;
  
  // Estimate GPU tier based on available info
  const gpuTier = (() => {
    if (!gl) return 'low';
    const renderer = gl.getParameter(gl.RENDERER) || '';
    const vendor = gl.getParameter(gl.VENDOR) || '';
    
    // High-end indicators
    if (renderer.includes('RTX') || renderer.includes('GTX 16') || renderer.includes('GTX 20') ||
        renderer.includes('RX 6') || renderer.includes('RX 7') || renderer.includes('M1') ||
        renderer.includes('M2') || maxTextureSize >= 16384) {
      return 'high';
    }
    
    // Mid-range indicators
    if (renderer.includes('GTX') || renderer.includes('RX') || 
        renderer.includes('Iris') || maxTextureSize >= 8192) {
      return 'medium';
    }
    
    return 'low';
  })();
  
  return {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    dpr,
    screenSize,
    gpuTier,
    maxTextureSize,
    maxRenderbufferSize,
    maxFragmentUniforms,
    memoryInfo: (performance as any)?.memory || null,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
  };
};

// Quality presets based on device capabilities
const getQualityPresets = (capabilities: ReturnType<typeof getDeviceCapabilities>) => {
  const { isMobile, isTablet, gpuTier, screenSize, dpr } = capabilities;
  
  if (isMobile) {
    return {
      ultra: { maxDpr: Math.min(1.0, dpr), maxSplats: 3000000, antialias: false, shadows: false },
      high: { maxDpr: Math.min(0.8, dpr), maxSplats: 2000000, antialias: false, shadows: false },
      medium: { maxDpr: Math.min(0.6, dpr), maxSplats: 1500000, antialias: false, shadows: false },
      low: { maxDpr: 0.4, maxSplats: 1000000, antialias: false, shadows: false },
      potato: { maxDpr: 0.3, maxSplats: 500000, antialias: false, shadows: false },
    };
  }
  
  if (isTablet) {
    return {
      ultra: { maxDpr: Math.min(1.5, dpr), maxSplats: 8000000, antialias: true, shadows: false },
      high: { maxDpr: Math.min(1.2, dpr), maxSplats: 6000000, antialias: true, shadows: false },
      medium: { maxDpr: 1.0, maxSplats: 4000000, antialias: false, shadows: false },
      low: { maxDpr: 0.8, maxSplats: 2000000, antialias: false, shadows: false },
      potato: { maxDpr: 0.6, maxSplats: 1000000, antialias: false, shadows: false },
    };
  }
  
  // Desktop presets based on GPU tier
  if (gpuTier === 'high') {
    return {
      ultra: { maxDpr: Math.min(2.0, dpr), maxSplats: 50000000, antialias: true, shadows: true },
      high: { maxDpr: Math.min(1.5, dpr), maxSplats: 30000000, antialias: true, shadows: true },
      medium: { maxDpr: 1.0, maxSplats: 20000000, antialias: true, shadows: false },
      low: { maxDpr: 0.8, maxSplats: 10000000, antialias: false, shadows: false },
      potato: { maxDpr: 0.6, maxSplats: 5000000, antialias: false, shadows: false },
    };
  }
  
  if (gpuTier === 'medium') {
    return {
      ultra: { maxDpr: Math.min(1.5, dpr), maxSplats: 20000000, antialias: true, shadows: false },
      high: { maxDpr: 1.0, maxSplats: 15000000, antialias: true, shadows: false },
      medium: { maxDpr: 0.8, maxSplats: 10000000, antialias: false, shadows: false },
      low: { maxDpr: 0.6, maxSplats: 5000000, antialias: false, shadows: false },
      potato: { maxDpr: 0.4, maxSplats: 2000000, antialias: false, shadows: false },
    };
  }
  
  // Low-end desktop/GPU
  return {
    ultra: { maxDpr: 1.0, maxSplats: 10000000, antialias: false, shadows: false },
    high: { maxDpr: 0.8, maxSplats: 8000000, antialias: false, shadows: false },
    medium: { maxDpr: 0.6, maxSplats: 5000000, antialias: false, shadows: false },
    low: { maxDpr: 0.4, maxSplats: 3000000, antialias: false, shadows: false },
    potato: { maxDpr: 0.3, maxSplats: 1000000, antialias: false, shadows: false },
  };
};

type QualityLevel = 'ultra' | 'high' | 'medium' | 'low' | 'potato';

function App() {
  const capabilities = useMemo(() => getDeviceCapabilities(), []);
  const qualityPresets = useMemo(() => getQualityPresets(capabilities), [capabilities]);
  
  // Enhanced state management
  const [currentQuality, setCurrentQuality] = useState<QualityLevel>('high');
  const [isAdaptive, setIsAdaptive] = useState(true);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const [frameTimeHistory, setFrameTimeHistory] = useState<number[]>([]);
  const [lastAdjustment, setLastAdjustment] = useState(0);
  const [stabilityCounter, setStabilityCounter] = useState(0);
  const [targetFps, setTargetFps] = useState(capabilities.isMobile ? 30 : 60);
  const [currentFps, setCurrentFps] = useState(targetFps);
  
  const performanceDataRef = useRef({
    avgFps: targetFps,
    avgFrameTime: 1000 / targetFps,
    gpuMemory: 0,
    cpuTime: 0,
    renderTime: 0,
  });

  // Leva controls with enhanced options
  const { 
    url, 
    manualQuality, 
    adaptiveMode, 
    targetFpsControl,
    debugMode,
    aggressiveOptimization 
  } = useControls({
    url: { label: 'Model URL', options: urls },
    manualQuality: { 
      label: 'Quality Level', 
      options: ['ultra', 'high', 'medium', 'low', 'potato'],
      value: currentQuality
    },
    adaptiveMode: {
      label: 'Adaptive Quality',
      value: isAdaptive,
    },
    targetFpsControl: {
      label: 'Target FPS',
      value: targetFps,
      min: 15,
      max: 120,
      step: 5,
    },
    debugMode: {
      label: 'Show Debug Info',
      value: true,
    },
    aggressiveOptimization: {
      label: 'Aggressive Optimization',
      value: capabilities.isMobile,
    },
  });

  // Update current quality and settings based on controls
  const currentSettings = qualityPresets[isAdaptive ? currentQuality : manualQuality];

  // Enhanced FPS tracking and smoothing
  const updatePerformanceMetrics = useCallback((fps: number, frameTime?: number) => {
    const now = performance.now();
    
    setFpsHistory(prev => {
      const updated = [...prev.slice(-29), fps]; // Keep last 30 samples
      const avgFps = updated.reduce((a, b) => a + b, 0) / updated.length;
      performanceDataRef.current.avgFps = avgFps;
      return updated;
    });

    if (frameTime) {
      setFrameTimeHistory(prev => {
        const updated = [...prev.slice(-29), frameTime];
        const avgFrameTime = updated.reduce((a, b) => a + b, 0) / updated.length;
        performanceDataRef.current.avgFrameTime = avgFrameTime;
        return updated;
      });
    }

    setCurrentFps(fps);
  }, []);

  // Enhanced adaptive quality algorithm
  const adaptQuality = useCallback((fps: number) => {
    if (!isAdaptive) return;
    
    const now = performance.now();
    const timeSinceLastAdjustment = now - lastAdjustment;
    
    // Don't adjust too frequently
    if (timeSinceLastAdjustment < (aggressiveOptimization ? 1000 : 2000)) return;
    
    const { avgFps } = performanceDataRef.current;
    const fpsVariance = fpsHistory.length > 10 ? 
      Math.sqrt(fpsHistory.reduce((acc, f) => acc + Math.pow(f - avgFps, 2), 0) / fpsHistory.length) : 0;
    
    // Stability check - don't change if FPS is stable and acceptable
    if (Math.abs(avgFps - targetFps) < 5 && fpsVariance < 3) {
      setStabilityCounter(prev => prev + 1);
      if (stabilityCounter > 5) return; // System is stable
    } else {
      setStabilityCounter(0);
    }

    const qualityLevels: QualityLevel[] = ['potato', 'low', 'medium', 'high', 'ultra'];
    const currentIndex = qualityLevels.indexOf(currentQuality);
    
    let newQuality = currentQuality;
    
    // Performance-based quality adjustment
    if (avgFps < targetFps * 0.7) { // Significant performance drop
      if (currentIndex > 0) {
        newQuality = qualityLevels[Math.max(0, currentIndex - (aggressiveOptimization ? 2 : 1))];
      }
    } else if (avgFps > targetFps * 1.1 && fpsVariance < 5) { // Good performance, try to increase quality
      if (currentIndex < qualityLevels.length - 1) {
        newQuality = qualityLevels[currentIndex + 1];
      }
    } else if (avgFps < targetFps * 0.85) { // Moderate performance drop
      if (currentIndex > 0) {
        newQuality = qualityLevels[currentIndex - 1];
      }
    }
    
    if (newQuality !== currentQuality) {
      console.log(`Quality adjusted: ${currentQuality} → ${newQuality} (FPS: ${avgFps.toFixed(1)}, Target: ${targetFps})`);
      setCurrentQuality(newQuality);
      setLastAdjustment(now);
    }
  }, [currentQuality, isAdaptive, targetFps, aggressiveOptimization, fpsHistory, lastAdjustment, stabilityCounter]);

  // Enhanced performance monitoring
  const handlePerformanceChange = useCallback(({ fps, factor }: { fps: number; factor: number }) => {
    const frameTime = 1000 / fps;
    updatePerformanceMetrics(fps, frameTime);
    adaptQuality(fps);
  }, [updatePerformanceMetrics, adaptQuality]);

  // Update settings when controls change
  useEffect(() => {
    setIsAdaptive(adaptiveMode);
  }, [adaptiveMode]);

  useEffect(() => {
    if (!adaptiveMode) {
      setCurrentQuality(manualQuality as QualityLevel);
    }
  }, [manualQuality, adaptiveMode]);

  useEffect(() => {
    setTargetFps(targetFpsControl);
  }, [targetFpsControl]);

  // Memory monitoring (if available)
  const memoryInfo = useMemo(() => {
    const memory = (performance as any)?.memory;
    if (!memory) return null;
    
    return {
      used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
    };
  }, [currentFps]); // Update with FPS for live monitoring

  return (
    <>
      <Leva oneLineLabels collapsed={!debugMode} />
      <Canvas
        className="h-full w-full bg-black"
        gl={{ 
          antialias: currentSettings.antialias,
          powerPreference: capabilities.isMobile ? "low-power" : "high-performance",
          alpha: false,
          precision: capabilities.isMobile ? "lowp" : "highp",
          stencil: false,
          depth: true,
          logarithmicDepthBuffer: false,
        }}
        dpr={currentSettings.maxDpr}
        shadows={currentSettings.shadows}
        frameloop="always"
        performance={{ min: 0.2, max: 1, debounce: 200 }}
      >
        <PerformanceMonitor
          onDecline={handlePerformanceChange}
          onIncline={handlePerformanceChange}
          onChange={handlePerformanceChange}
          factor={0.9} // More sensitive to performance changes
          flipflops={aggressiveOptimization ? 2 : 3} // How many frame flips before action
        />

        {debugMode && <StatsGl />}
        
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05}
          maxDistance={capabilities.isMobile ? 10 : 20}
          minDistance={0.5}
        />
        
        <group position={[0, 0, 0]}>
          <Splat url={url} maxSplats={currentSettings.maxSplats} />
        </group>

        <Environment 
          preset="city" 
          resolution={capabilities.isMobile ? 256 : 512}
          background={false}
        />
      </Canvas>

      {debugMode && (
        <div className="absolute bottom-0 left-0 rounded-lg bg-black/80 text-white text-xs p-3 m-4 font-mono max-w-xs">
          <div className="text-green-400 font-semibold mb-2">Performance Monitor</div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Device:</div>
            <div className="text-cyan-300">
              {capabilities.isMobile ? '📱 Mobile' : capabilities.isTablet ? '📟 Tablet' : '🖥️ Desktop'}
            </div>
            
            <div>GPU Tier:</div>
            <div className={`${
              capabilities.gpuTier === 'high' ? 'text-green-400' : 
              capabilities.gpuTier === 'medium' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {capabilities.gpuTier.toUpperCase()}
            </div>
            
            <div>Quality:</div>
            <div className={`${
              currentQuality === 'ultra' ? 'text-purple-400' :
              currentQuality === 'high' ? 'text-green-400' :
              currentQuality === 'medium' ? 'text-yellow-400' :
              currentQuality === 'low' ? 'text-orange-400' : 'text-red-400'
            }`}>
              {currentQuality.toUpperCase()} {!isAdaptive ? '(MANUAL)' : '(AUTO)'}
            </div>
            
            <div>FPS:</div>
            <div className={currentFps >= targetFps * 0.9 ? 'text-green-400' : 
                           currentFps >= targetFps * 0.7 ? 'text-yellow-400' : 'text-red-400'}>
              {currentFps.toFixed(1)} / {targetFps}
            </div>
            
            <div>Avg FPS:</div>
            <div>{performanceDataRef.current.avgFps.toFixed(1)}</div>
            
            <div>Pixel Ratio:</div>
            <div>{currentSettings.maxDpr.toFixed(2)}</div>
            
            <div>Splats:</div>
            <div>{(currentSettings.maxSplats / 1e6).toFixed(1)}M</div>
            
            <div>Resolution:</div>
            <div>{Math.round(window.innerWidth * currentSettings.maxDpr)}×{Math.round(window.innerHeight * currentSettings.maxDpr)}</div>
            
            {memoryInfo && (
              <>
                <div>Memory:</div>
                <div className={memoryInfo.used / memoryInfo.total > 0.8 ? 'text-red-400' : 'text-green-400'}>
                  {memoryInfo.used}/{memoryInfo.total}MB
                </div>
              </>
            )}
            
            <div>Cores:</div>
            <div>{capabilities.hardwareConcurrency}</div>
          </div>
          
          <div className="mt-2 pt-2 border-t border-gray-600">
            <div className="text-xs text-gray-400">
              Features: {currentSettings.antialias ? '🎨' : ''} {currentSettings.shadows ? '🌙' : ''} {isAdaptive ? '🧠' : ''}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;