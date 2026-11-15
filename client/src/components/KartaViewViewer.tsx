import { useEffect, useRef, useState } from 'react';

interface KartaViewViewerProps {
  photoUrl: string | null;
  isPano: boolean;
  compassAngle: number;
  allowMoving: boolean;
  allowPanning?: boolean;
  allowZooming?: boolean;
  resetSignal: number;
  onBearingChange: (bearing: number) => void;
  onMovedFromStart: (moved: boolean) => void;
}

export function KartaViewViewer({
  photoUrl,
  isPano,
  compassAngle,
  allowPanning = true,
  allowZooming = true,
  resetSignal,
  onBearingChange,
  onMovedFromStart,
}: KartaViewViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const yawRef = useRef<number>((compassAngle * Math.PI) / 180);
  const pitchRef = useRef<number>(0);
  const fovRef = useRef<number>(75);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    onMovedFromStart(false);
    yawRef.current = (compassAngle * Math.PI) / 180;
    pitchRef.current = 0;
    fovRef.current = 75;
  }, [photoUrl, compassAngle, onMovedFromStart]);

  useEffect(() => {
    if (resetSignal > 0) {
      yawRef.current = (compassAngle * Math.PI) / 180;
      pitchRef.current = 0;
      fovRef.current = 75;
      onBearingChange(compassAngle);
    }
  }, [resetSignal, compassAngle, onBearingChange]);

  // WebGL 360 Spherical Panorama Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photoUrl || !isPano) return;

    let animId: number;
    let disposed = false;
    setLoading(true);
    setError(null);

    const gl =
      (canvas.getContext('webgl2', { alpha: false, antialias: true }) as WebGLRenderingContext | null) ||
      (canvas.getContext('webgl', { alpha: false, antialias: true }) as WebGLRenderingContext | null);

    if (!gl) {
      setError('WebGL is not supported in this browser.');
      setLoading(false);
      return;
    }

    const vsSource = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_tex;
      uniform float u_yaw;
      uniform float u_pitch;
      uniform float u_fov;
      uniform float u_aspect;
      #define PI 3.141592653589793

      void main() {
        vec2 p = (v_uv - 0.5) * 2.0;
        float tanFov = tan(u_fov * 0.5 * PI / 180.0);
        vec3 ray = normalize(vec3(p.x * tanFov * u_aspect, p.y * tanFov, 1.0));

        // Rotate ray by pitch then yaw
        float cp = cos(u_pitch);
        float sp = sin(u_pitch);
        vec3 r1 = vec3(ray.x, ray.y * cp - ray.z * sp, ray.y * sp + ray.z * cp);

        float cy = cos(u_yaw);
        float sy = sin(u_yaw);
        vec3 r2 = vec3(r1.x * cy + r1.z * sy, r1.y, -r1.x * sy + r1.z * cy);

        float phi = atan(r2.x, r2.z);
        float theta = asin(clamp(r2.y, -0.999, 0.999));

        // Seamless 360 wrap without NPOT hardware repeat restrictions
        float u = fract((phi / (2.0 * PI)) + 0.5);
        float v = clamp(0.5 - (theta / PI), 0.001, 0.999);
        gl_FragColor = texture2D(u_tex, vec2(u, v));
      }
    `;

    function compileShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posAttr = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (disposed) return;
      try {
        const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
        // Standard power-of-two texture dimensions (2048x1024) ensure universal WebGL compatibility
        const targetW = Math.min(maxTex >= 4096 ? 4096 : 2048, maxTex);
        const targetH = Math.round(targetW / 2);

        const offscreen = document.createElement('canvas');
        offscreen.width = targetW;
        offscreen.height = targetH;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
        }

        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          offscreen,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        setLoading(false);
      } catch (e) {
        if (!disposed) {
          setError('Failed to upload panorama texture to WebGL.');
          setLoading(false);
        }
      }
    };

    img.onerror = () => {
      if (!disposed) {
        setError('Failed to load KartaView street imagery.');
        setLoading(false);
      }
    };
    img.src = photoUrl;

    const uYaw = gl.getUniformLocation(prog, 'u_yaw');
    const uPitch = gl.getUniformLocation(prog, 'u_pitch');
    const uFov = gl.getUniformLocation(prog, 'u_fov');
    const uAspect = gl.getUniformLocation(prog, 'u_aspect');

    const render = () => {
      if (disposed) return;
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      gl.uniform1f(uYaw, yawRef.current);
      gl.uniform1f(uPitch, pitchRef.current);
      gl.uniform1f(uFov, fovRef.current);
      gl.uniform1f(uAspect, height > 0 ? width / height : 1.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);

    // Watch for parent resize
    const ro = new ResizeObserver(() => {
      if (!disposed) {
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    });
    ro.observe(canvas);

    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(animId);
      gl.deleteTexture(tex);
      gl.deleteBuffer(quadBuf);
      gl.deleteProgram(prog);
    };
  }, [photoUrl, isPano]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!allowPanning) return;
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !allowPanning) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    const speed = 0.003 * (fovRef.current / 75);
    yawRef.current -= dx * speed;
    pitchRef.current = Math.max(
      -Math.PI / 2.3,
      Math.min(Math.PI / 2.3, pitchRef.current + dy * speed),
    );

    // Normalize bearing to 0-360 degrees
    let deg = ((yawRef.current * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    onBearingChange(deg);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!allowZooming) return;
    e.preventDefault();
    const zoomSpeed = 0.05;
    fovRef.current = Math.max(
      30,
      Math.min(105, fovRef.current + e.deltaY * zoomSpeed),
    );
  };

  return (
    <div
      ref={containerRef}
      className="panorama-host"
      style={{
        position: 'absolute',
        inset: 0,
        inlineSize: '100%',
        blockSize: '100%',
        overflow: 'hidden',
        background: '#090e1a',
      }}
    >
      {isPano ? (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            inlineSize: '100%',
            blockSize: '100%',
            display: 'block',
            cursor: allowPanning ? 'grab' : 'default',
            touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />
      ) : photoUrl ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            inlineSize: '100%',
            blockSize: '100%',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={photoUrl}
            alt="KartaView street capture"
            style={{
              maxInlineSize: '100%',
              maxBlockSize: '100%',
              objectFit: 'contain',
            }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Could not load KartaView street photo.');
            }}
          />
        </div>
      ) : null}

      {loading ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(2, 6, 23, 0.65)',
            pointerEvents: 'none',
            zIndex: 420,
          }}
        >
          <div className="hud-pill">Loading KartaView 360° Imagery…</div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="alert alert--error"
          style={{
            position: 'absolute',
            insetBlockEnd: '5rem',
            insetInlineStart: '1rem',
            zIndex: 460,
          }}
        >
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
