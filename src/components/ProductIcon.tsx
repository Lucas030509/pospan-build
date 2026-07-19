import { CSSProperties } from "react";
import { isImageIcon } from "../lib/iconLibrary";

interface ProductIconProps {
    icon: string;
    size?: string;
    rounded?: boolean;
    style?: CSSProperties;
}

// Renderiza el ícono de un producto: si es una imagen subida por el usuario,
// la muestra como <img> recortada a un cuadrado; si es un emoji, lo muestra
// como texto. En ambos casos ocupa exactamente el mismo espacio (size),
// así que la imagen se autoajusta al tamaño que antes ocupaba el ícono.
export default function ProductIcon({ icon, size = '1.5rem', rounded = true, style }: ProductIconProps) {
    if (isImageIcon(icon)) {
        return (
            <img
                src={icon}
                alt=""
                style={{
                    width: size, height: size, minWidth: size, objectFit: 'cover',
                    borderRadius: rounded ? '8px' : 0, flexShrink: 0,
                    display: 'inline-block', verticalAlign: 'middle',
                    ...style,
                }}
            />
        );
    }
    return (
        <span style={{ fontSize: size, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle', ...style }}>
            {icon}
        </span>
    );
}
