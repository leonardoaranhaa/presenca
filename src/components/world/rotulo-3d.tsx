import { Suspense } from "react";
import { Billboard, Text } from "@react-three/drei";

/**
 * Rótulo de texto no mundo 3D, isolado do resto da cena.
 *
 * O `<Text>` do drei usa troika, que vai buscar dados de fontes ao
 * `cdn.jsdelivr.net` **em tempo de execução**. Enquanto esse pedido não
 * resolve, o componente suspende — e a fronteira `<Suspense>` mais próxima era
 * a do router, que esconde a rota inteira com `display: none`.
 *
 * O efeito era este: numa rede lenta, atrás de uma firewall, ou com o CDN em
 * baixo, quem abrisse o lar via uma **página em branco**. Sem erro, sem
 * explicação, sem recuperação — porque o React não desmonta o que suspende,
 * apenas o esconde.
 *
 * Um nome a flutuar sobre um avatar não pode ter poder de apagar o produto.
 * Cada rótulo tem agora a sua própria fronteira: se a fonte não chegar, falta
 * o nome e o mundo continua lá.
 */
export function Rotulo3D({
  texto,
  position,
  fontSize = 0.16,
  color = "#e8e0d2",
  maxWidth = 3,
}: {
  texto: string;
  position: [number, number, number];
  fontSize?: number;
  color?: string;
  maxWidth?: number;
}) {
  return (
    <Suspense fallback={null}>
      <Billboard position={position}>
        <Text
          fontSize={fontSize}
          color={color}
          outlineWidth={fontSize * 0.05}
          outlineColor="#1c2228"
          anchorX="center"
          anchorY="middle"
          maxWidth={maxWidth}
        >
          {texto}
        </Text>
      </Billboard>
    </Suspense>
  );
}
