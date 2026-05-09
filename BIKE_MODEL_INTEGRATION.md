# 🏍️ Tesla-Style Bike Model Integration Guide

This guide shows you how to integrate your `model.glb` file into a Tesla-style auto display for your car vision system.

## 📁 Files Created

1. **`BikeModelLoader.web.js`** - Basic GLB model loader with Three.js
2. **`TeslaBikeDisplay.web.js`** - Tesla-style 360° display with your bike model
3. **`BikeModelDemo.web.js`** - Interactive demo component
4. **Updated `App.js`** - Added navigation to the bike demo

## 🚀 Quick Start

1. **Place your model file:**
   ```
   car-vision-frontend/
   ├── model.glb          <- Your bike model here
   ├── public/
   │   └── model.glb      <- Or here for web builds
   ```

2. **Run the demo:**
   ```bash
   cd car-vision-frontend
   npm run web
   ```

3. **Navigate to the demo:**
   - Click "🏍️ Tesla Bike Display Demo" button in the main app

## 🎛️ Demo Features

### View Modes
- **Tesla Display**: Full Tesla-style interface with your bike model
- **Model Viewer**: Simple model viewer with camera controls

### Controls
- **Camera Angles**: front, rear, left, right, top, diagonal
- **Lighting Modes**: tesla, studio, auto
- **Animation**: Start/stop rotation animation

### Tesla Display Features
- Real-time bike model rendering
- 360° camera position indicators
- Distance rings (3m, 6m, 9m, 12m)
- Hazard level visualization
- Speed and status display
- Tesla-style UI elements

## 🔧 Customization

### Model Path
Update the model path in your components:
```javascript
// For local development
modelPath="./model.glb"

// For production builds
modelPath="/model.glb"

// For external URLs
modelPath="https://your-domain.com/models/bike.glb"
```

### Model Scaling
Adjust the model size in `processModel()` function:
```javascript
const targetSize = 4; // Increase for bigger model
const scale = targetSize / maxDimension;
model.scale.setScalar(scale);
```

### Tesla Colors
Customize the Tesla color scheme:
```javascript
const TESLA_COLORS = {
  primary: '#22d3ee',    // Tesla blue
  secondary: '#38bdf8',  // Light blue
  accent: '#0ea5e9',     // Accent blue
  warning: '#fbbf24',    // Yellow
  danger: '#ef4444',     // Red
  success: '#10b981',    // Green
  background: '#0a0a0a', // Dark background
  panel: '#1a1a1a',      // Panel background
};
```

## 🔗 Integration with Existing System

### 1. Replace Motorcycle360Vision
```javascript
// Old component
import Motorcycle360Vision from './Motorcycle360Vision.web';

// New component with your model
import TeslaBikeDisplay from './TeslaBikeDisplay.web';

// Usage
<TeslaBikeDisplay
  width={800}
  height={600}
  modelPath="./model.glb"
  visionData={visionData}
  cameraFeeds={cameraFeeds}
  isRunning={isRunning}
  bikeRotation={bikeRotation}
/>
```

### 2. Add to Existing 360° System
```javascript
// In your main vision component
import TeslaBikeDisplay from './TeslaBikeDisplay.web';

const YourVisionSystem = () => {
  return (
    <View style={styles.container}>
      {/* Your existing camera feeds */}
      
      {/* Replace center display with Tesla bike display */}
      <TeslaBikeDisplay
        modelPath="./model.glb"
        visionData={processedVisionData}
        cameraFeeds={activeCameraFeeds}
        isRunning={systemActive}
        bikeRotation={currentHeading}
      />
    </View>
  );
};
```

### 3. Connect Real Data
```javascript
// Example data structure
const visionData = {
  speed: 45,                    // Current speed in km/h
  global_hazard: {
    level: 1,                   // 0-3 hazard level
    note: 'Clear road ahead',   // Status message
    alert_color: 'green'        // Alert color
  },
  cameras: {
    front: { hazard_level: 0, objects: [] },
    rear: { hazard_level: 1, objects: [...] },
    left: { hazard_level: 0, objects: [] },
    right: { hazard_level: 0, objects: [] }
  }
};

const cameraFeeds = {
  front: true,    // Camera active
  rear: true,     // Camera active
  left: false,    // Camera inactive
  right: false    // Camera inactive
};
```

## 🎨 Model Requirements

### Supported Formats
- **GLB** (recommended) - Binary GLTF
- **GLTF** - Text-based GLTF with separate assets

### Model Optimization
- **Polygons**: Keep under 50k triangles for smooth performance
- **Textures**: Use compressed formats (JPG for diffuse, PNG for alpha)
- **Size**: Keep total file size under 10MB
- **Materials**: Use PBR materials for best Tesla-style rendering

### Model Preparation Tips
1. **Center the model** at origin (0,0,0)
2. **Face forward** along positive Z-axis
3. **Reasonable scale** (1-5 units in largest dimension)
4. **Clean geometry** (no duplicate vertices, proper normals)

## 🐛 Troubleshooting

### Model Not Loading
1. Check browser console for errors
2. Verify model path is correct
3. Ensure model file is accessible
4. Try with a simple test model first

### Performance Issues
1. Reduce model complexity
2. Optimize textures
3. Lower renderer pixel ratio
4. Disable shadows if needed

### Scaling Issues
1. Adjust `targetSize` in `processModel()`
2. Check model's original scale
3. Use Blender to resize before export

## 📱 Browser Compatibility

### Supported Browsers
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

### WebGL Requirements
- WebGL 2.0 support required
- Hardware acceleration enabled
- Sufficient GPU memory

## 🔄 Next Steps

1. **Replace model path** with your actual GLB file
2. **Test the demo** to ensure everything works
3. **Customize colors** and styling to match your brand
4. **Integrate with real camera feeds** from your vision system
5. **Add custom animations** or interactions as needed

## 💡 Advanced Features

### Custom Animations
```javascript
// Add custom bike animations
useEffect(() => {
  if (bikeModelRef.current && isRunning) {
    // Lean animation based on turn data
    const leanAngle = turnData * 0.1;
    bikeModelRef.current.rotation.z = leanAngle;
    
    // Suspension animation based on speed
    const bounce = Math.sin(Date.now() * 0.01) * speed * 0.001;
    bikeModelRef.current.position.y = bounce;
  }
}, [isRunning, turnData, speed]);
```

### Interactive Controls
```javascript
// Add mouse/touch controls for camera
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
```

### Real-time Lighting
```javascript
// Sync lighting with time of day
const timeOfDay = new Date().getHours();
const sunIntensity = timeOfDay > 6 && timeOfDay < 18 ? 1.0 : 0.3;
mainLight.intensity = sunIntensity;
```

---

🎉 **Your bike model is now ready for Tesla-style display!**

For questions or issues, check the browser console for detailed error messages.