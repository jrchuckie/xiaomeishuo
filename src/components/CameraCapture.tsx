import { Camera, CircleAlert, ImagePlus, LoaderCircle, SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CaptureKind } from "../types";

type Props = {
  kind: CaptureKind;
  label: string;
  onCapture: (file: File) => void;
};

export default function CameraCapture({ kind, label, onCapture }: Props) {
  const [open, setOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      stop();
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("当前页面无法调用摄像头。手机端请使用 HTTPS 地址打开。");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (caught) {
        const name = caught instanceof DOMException ? caught.name : "";
        setError(name === "NotAllowedError" ? "摄像头权限未开启，请在浏览器设置中允许访问。" : "摄像头启动失败，可改用相册上传。");
      }
    };
    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facingMode]);

  const close = () => {
    stop();
    setOpen(false);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d")!;
    if (facingMode === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `${kind}-${Date.now()}.jpg`, { type: "image/jpeg" }));
      close();
    }, "image/jpeg", 0.94);
  };

  return (
    <>
      <button className="camera-launch" type="button" onClick={() => setOpen(true)}>
        <Camera size={17} /> 直接拍摄
      </button>
      {open && (
        <div className="camera-modal" role="dialog" aria-modal="true" aria-label={`拍摄${label}`}>
          <div className="camera-topbar">
            <button type="button" onClick={close} aria-label="关闭相机"><X size={23} /></button>
            <strong>{label} · 原相机</strong>
            <button type="button" onClick={() => setFacingMode((current) => current === "user" ? "environment" : "user")} aria-label="切换前后摄像头"><SwitchCamera size={23} /></button>
          </div>
          <div className={`camera-stage ${kind} ${facingMode}`}>
            <video ref={videoRef} muted playsInline />
            <div className="face-guide"><span /></div>
            <p>{kind === "front" ? "平视镜头 · 头部居中 · 不仰头" : "转到完整侧面 · 露出鼻尖与下颌线"}</p>
            {!ready && !error && <div className="camera-waiting"><LoaderCircle className="spin" size={19} />请在浏览器提示中允许使用相机</div>}
            {error && <div className="camera-error"><CircleAlert size={18} />{error}</div>}
          </div>
          <div className="camera-controls">
            <label className="camera-library">
              <input type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onCapture(file);
                  close();
                }
              }} />
              <ImagePlus size={22} /><span>相册</span>
            </label>
            <button className="shutter" type="button" onClick={capture} disabled={!ready} aria-label="拍照"><i /></button>
            <span className="camera-spacer" />
          </div>
        </div>
      )}
    </>
  );
}
