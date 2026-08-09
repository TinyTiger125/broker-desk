export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="bd-route-loading">
      <span className="sr-only">正在加载</span>
      <div className="bd-route-loading-track" aria-hidden="true">
        <div className="bd-route-loading-bar" />
      </div>
    </div>
  );
}
