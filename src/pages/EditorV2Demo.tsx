import React, { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, Rect, Textbox } from 'fabric';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Simple inline V2 demo - avoiding complex imports to diagnose build issues
export function EditorV2Demo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<FabricCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const fabricCanvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff'
    });

    // Add a sample rectangle
    const rect = new Rect({
      left: 50,
      top: 50,
      width: 100,
      height: 60,
      fill: '#e0f2fe',
      stroke: '#0ea5e9',
      strokeWidth: 2
    });
    fabricCanvas.add(rect);

    // Add sample text
    const text = new Textbox('Editor V2 Demo', {
      left: 50,
      top: 150,
      width: 200,
      fontSize: 24,
      fontFamily: 'Inter',
      fill: '#111827'
    });
    fabricCanvas.add(text);

    setCanvas(fabricCanvas);

    return () => {
      fabricCanvas.dispose();
    };
  }, []);

  const handleAddRect = () => {
    if (!canvas) return;
    const rect = new Rect({
      left: Math.random() * 300 + 50,
      top: Math.random() * 300 + 50,
      width: 80,
      height: 50,
      fill: '#dbeafe',
      stroke: '#3b82f6',
      strokeWidth: 1
    });
    canvas.add(rect);
    canvas.renderAll();
  };

  const handleAddText = () => {
    if (!canvas) return;
    const text = new Textbox('New Text', {
      left: Math.random() * 300 + 50,
      top: Math.random() * 300 + 50,
      width: 150,
      fontSize: 16,
      fontFamily: 'Inter',
      fill: '#374151'
    });
    canvas.add(text);
    canvas.renderAll();
  };

  return (
    <div className="h-screen w-full p-4 bg-muted/30">
      <Card className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h1 className="text-xl font-semibold">Editor V2 Demo</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleAddRect}>
              Add Rectangle
            </Button>
            <Button variant="outline" size="sm" onClick={handleAddText}>
              Add Text
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <canvas ref={canvasRef} className="border rounded shadow-sm" />
        </div>
      </Card>
    </div>
  );
}

export default EditorV2Demo;
