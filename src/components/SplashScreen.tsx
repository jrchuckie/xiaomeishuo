import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

type SplashScreenProps = {
  ready: boolean;
  onComplete: () => void;
};

const SPLASH_SESSION_KEY = "xiaomeishuo:splash-seen:v1";

export default function SplashScreen({ ready, onComplete }: SplashScreenProps) {
  const [returning, setReturning] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);

  useEffect(() => {
    const forceFull = new URLSearchParams(window.location.search).get("splash") === "1";
    const hasSeenSplash = window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
    const shouldCompress = hasSeenSplash && !forceFull;
    setReturning(shouldCompress);

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = themeColor?.content;
    if (themeColor) themeColor.content = "#151517";

    const timer = window.setTimeout(() => setExitRequested(true), shouldCompress ? 720 : 2_850);
    return () => {
      window.clearTimeout(timer);
      if (themeColor && previousTheme) themeColor.content = previousTheme;
    };
  }, []);

  useEffect(() => {
    if (!ready || !exitRequested) return;
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    const timer = window.setTimeout(onComplete, 460);
    return () => window.clearTimeout(timer);
  }, [exitRequested, onComplete, ready]);

  return (
    <section
      className={`splash-screen${returning ? " is-returning" : ""}${ready && exitRequested ? " is-exiting" : ""}`}
      aria-label="小美说正在启动"
      aria-live="polite"
    >
      <div className="splash-lines" aria-hidden="true">
        <i /><i /><i /><i />
      </div>

      <button className="splash-skip" type="button" onClick={() => setExitRequested(true)}>
        <span>跳过</span><ArrowRight size={16} />
      </button>

      <div className="splash-stage">
        <div className="splash-brand-lockup">
          <span className="splash-mark" aria-hidden="true"><i /><i /></span>
          <div className="splash-name">
            <strong>小美说</strong>
            <span>IDEAL ME</span>
          </div>
        </div>

        <h1 className="splash-thesis">
          <span>美没有统一答案，</span>
          <span>你喜欢的样子才是起点</span>
        </h1>
      </div>

      <div className="splash-story" aria-hidden="true">
        <p><b>01</b><span>读懂收藏里的喜欢</span></p>
        <p><b>02</b><span>映射真实的你</span></p>
        <p><b>03</b><span>看见可行的改变</span></p>
      </div>

      <div className="splash-status">
        <div className="splash-progress"><i /><i /><i /></div>
        <span>{ready ? "准备好了" : "正在打开你的本地档案"}</span>
      </div>
    </section>
  );
}
