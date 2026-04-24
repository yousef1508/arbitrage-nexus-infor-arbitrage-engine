import React, { useEffect, useRef } from 'react';
import { useLastRunStatus } from '@/lib/store';
/**
 * SystemPulse
 * High-performance canvas-based visualization for the Command Center.
 * Renders data particles pulsing outward to indicate active autonomous scanning.
 */
export const SystemPulse = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useLastRunStatus();
  const particles = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>>([]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', resize);
    resize();
    const createParticle = () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: Math.random() > 0.5 ? '#38BDF8' : '#10B981'
      };
    };
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Background pulse circle
      const alpha = status === 'running' ? 0.15 : 0.05;
      const radius = status === 'running' 
        ? 60 + Math.sin(Date.now() / 200) * 10 
        : 60;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = status === 'running' ? '#38BDF8' : '#1e293b';
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha;
      ctx.stroke();
      // Emit particles
      if (status === 'running' && particles.current.length < 50) {
        particles.current.push(createParticle());
      }
      // Update particles
      particles.current = particles.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.01;
        if (p.life > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.life * 0.4;
          ctx.fill();
          return true;
        }
        return false;
      });
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [status]);
  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
    />
  );
};