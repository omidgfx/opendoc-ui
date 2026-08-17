import clsx from 'clsx';
import OpenDocMark from './OpenDocMark';

export type BrandLogoType = 'logo' | 'wordmark' | null;
export type BrandLogoLayout = 'row' | 'stack';

type BrandPartVisibility = {
    hideInMobile?: boolean;
    hideInTablet?: boolean;
    hideInDesktop?: boolean;
};

export interface BrandLogoProps {
    /** `logo` renders only the mark, `wordmark` only the type, null renders both. */
    type?: BrandLogoType;
    /** Arrange the mark and wordmark horizontally or vertically. */
    layout?: BrandLogoLayout;
    /** Wrap the mark in the theme-aware surface tile. */
    logoFrame?: boolean;
    hideLogoInMobile?: boolean;
    hideLogoInTablet?: boolean;
    hideLogoInDesktop?: boolean;
    hideWordmarkInMobile?: boolean;
    hideWordmarkInTablet?: boolean;
    hideWordmarkInDesktop?: boolean;
    className?: string;
    logoClassName?: string;
    wordmarkClassName?: string;
    ariaLabel?: string;
}

function visibilityAttributes({hideInMobile, hideInTablet, hideInDesktop}: BrandPartVisibility) {
    return {
        'data-brand-part': 'true',
        'data-hide-mobile': hideInMobile ? 'true' : undefined,
        'data-hide-tablet': hideInTablet ? 'true' : undefined,
        'data-hide-desktop': hideInDesktop ? 'true' : undefined,
    };
}

function BrandWordmark({
    className,
    ariaLabel,
    hideInMobile,
    hideInTablet,
    hideInDesktop,
}: BrandPartVisibility & {className?: string; ariaLabel: string}) {
    return (
        <span
            className={clsx('brand-wordmark brand-logo-part', className)}
            role="img"
            aria-label={ariaLabel}
            {...visibilityAttributes({hideInMobile, hideInTablet, hideInDesktop})}
        >
            <span>Open</span>
            <span className="brand-wordmark-doc">Doc</span>
            <span className="brand-wordmark-ui">UI</span>
        </span>
    );
}

export default function BrandLogo({
    type = null,
    layout = 'row',
    logoFrame = true,
    hideLogoInMobile = false,
    hideLogoInTablet = false,
    hideLogoInDesktop = false,
    hideWordmarkInMobile = false,
    hideWordmarkInTablet = false,
    hideWordmarkInDesktop = false,
    className,
    logoClassName,
    wordmarkClassName,
    ariaLabel = 'OpenDoc UI',
}: BrandLogoProps) {
    const showLogo = type !== 'wordmark';
    const showWordmark = type !== 'logo';

    return (
        <span
            className={clsx(
                'brand-logo inline-flex min-w-0 items-center',
                layout === 'row' ? 'flex-row flex-wrap gap-2' : 'flex-col gap-3',
                className,
            )}
        >
            {showLogo && (
                <span
                    className={clsx('brand-logo-part shrink-0', logoFrame && 'brand-mark-shell', logoClassName)}
                    {...visibilityAttributes({
                        hideInMobile: hideLogoInMobile,
                        hideInTablet: hideLogoInTablet,
                        hideInDesktop: hideLogoInDesktop,
                    })}
                >
                    <OpenDocMark className="size-full" />
                </span>
            )}
            {showWordmark && (
                <BrandWordmark
                    className={clsx('min-w-0 shrink-0', wordmarkClassName)}
                    ariaLabel={ariaLabel}
                    hideInMobile={hideWordmarkInMobile}
                    hideInTablet={hideWordmarkInTablet}
                    hideInDesktop={hideWordmarkInDesktop}
                />
            )}
        </span>
    );
}
