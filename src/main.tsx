
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { StationScreen } from "./app/components/StationScreen.tsx";
  import "./styles/index.css";

  // Enrutado mínimo por query param: la PANTALLA DE ESTACIÓN de registro día a día
  // (independiente del mapa) se abre con ?estacion=SPIM (o ?vista=estacion para
  // autodetectar por huso horario). Cualquier otra URL abre el centro de operaciones.
  function resolveRoot() {
    const params = new URLSearchParams(window.location.search);
    const isStation = params.has('estacion') || params.get('vista') === 'estacion' || params.get('view') === 'station';
    return isStation ? <StationScreen /> : <App />;
  }

  createRoot(document.getElementById("root")!).render(resolveRoot());
