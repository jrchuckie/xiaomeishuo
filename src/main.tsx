import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ProductDemoTour from "./components/ProductDemoTour";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const Root = params.has("productTour") ? ProductDemoTour : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
