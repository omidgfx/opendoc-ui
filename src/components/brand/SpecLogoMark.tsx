import clsx from 'clsx';
import type {OpenApiSpec} from '../../types';
import {getSpecLogo} from '../../utils/specification/specLogo';
import OpenDocMark from './OpenDocMark';

interface SpecLogoMarkProps {
    spec: OpenApiSpec | null;
    /** Sizing/padding classes applied to the spec logo image or fallback mark. */
    className?: string;
    /** Accessible text when the mark has no spec-provided altText. */
    alt?: string;
}

/**
 * Specification-first brand mark: when the OpenAPI document declares
 * `info.x-logo`, its icon is the principal mark; otherwise the OpenDoc mark
 * is the fallback. Both variants honor the same sizing classes.
 */
export default function SpecLogoMark({spec, className, alt}: SpecLogoMarkProps) {
    const logo = getSpecLogo(spec);
    if (logo)
        return (
            <img
                src={logo.url}
                alt={logo.altText || alt || `${spec?.info?.title || 'API'} logo`}
                draggable={false}
                className={clsx('shrink-0 select-none object-contain', className)}
                style={logo.backgroundColor ? {backgroundColor: logo.backgroundColor} : undefined}
            />
        );
    return <OpenDocMark className={clsx('shrink-0', className)} />;
}
