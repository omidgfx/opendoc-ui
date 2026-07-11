import React, {useEffect, useState} from 'react';
import {ActiveAuth, OpenApiSpec, ParsableConfig} from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import ThemeSelectorModal from '../modals/ThemeSelectorModal';
import ApiSpecificationSelectorModal from '../modals/ApiSpecificationSelectorModal';
// @ts-ignore
import Logo from '../../logo.svg?react';

interface TopbarProps {
    parsables: ParsableConfig;
    selectedParsableKey: string;
    onSelectParsable: (key: string) => void;
    activeAuth: ActiveAuth;
    onUpdateAuth: (auth: ActiveAuth) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    currentThemeMode: 'light' | 'dark';
    onToggleThemeMode: () => void;
    onDownloadSpec: () => void;
    title: string;
    showSchemaExplorer: boolean;
    spec: OpenApiSpec | null;
    showHome: boolean;
    showAbout: boolean;
    onOpenHome: () => void;
    onOpenAbout: () => void;
    selectedThemeName: string;
    onSelectTheme: (themeName: string) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

export default function Topbar({
                                   parsables,
                                   selectedParsableKey,
                                   onSelectParsable,
                                   activeAuth,
                                   onUpdateAuth,
                                   searchQuery,
                                   onSearchChange,
                                   currentThemeMode,
                                   onToggleThemeMode,
                                   onDownloadSpec,
                                   title,
                                   showSchemaExplorer,
                                   spec,
                                   showHome,
                                   showAbout,
                                   onOpenHome,
                                   onOpenAbout,
                                   selectedThemeName,
                                   onSelectTheme,
                                   isCollapsed,
                                   onToggleCollapse
                               }: TopbarProps) {
    const [showMobileSearch, setShowMobileSearch] = useState(false);

    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showThemeModal, setShowThemeModal] = useState(false);
    const [showSpecificationModal, setShowSpecificationModal] = useState(false);
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    // Register Ctrl+K shortcut focus
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                const activeElem = document.activeElement;
                // Avoid focusing when user is typing inside textareas or inputs
                if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
                    return;
                }
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    React.useEffect(() => {
        if (!showAuthModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowAuthModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAuthModal]);


    // Authorization Form State
    const [authScheme, setAuthScheme] = useState(activeAuth.activeScheme);
    const [bearerToken, setBearerToken] = useState(activeAuth.bearerToken);
    const [apiKeyName, setApiKeyName] = useState(activeAuth.apiKeyName);
    const [apiKeyValue, setApiKeyValue] = useState(activeAuth.apiKeyValue);
    const [apiKeyIn, setApiKeyIn] = useState(activeAuth.apiKeyIn);
    const [basicUser, setBasicUser] = useState(activeAuth.basicUsername);
    const [basicPass, setBasicPassword] = useState(activeAuth.basicPassword);

    const getAvailableSchemes = () => {
        const defaultSchemes = [
            {id: 'none', name: 'No Authentication'},
            {id: 'cookie', name: 'Cookie Session (access_token)'},
            {id: 'bearer', name: 'Bearer Token (Header Authorization)'},
            {id: 'basic', name: 'Basic Authentication'},
            {id: 'apikey', name: 'Query/Header API Key'}];


        if (!spec?.components?.securitySchemes) {
            return defaultSchemes;
        }

        const schemes: Array<{ id: string; name: string; apiKeyName?: string; apiKeyIn?: string; }> = [
            {id: 'none', name: 'No Authentication'}];


        Object.entries(spec.components.securitySchemes).forEach(([key, schemeObj]) => {
            const s = schemeObj as any;
            if (s.type === 'apiKey') {
                if (s.in === 'cookie') {
                    schemes.push({
                        id: 'cookie',
                        name: `Cookie API Key - ${key} (${s.name || 'access_token'})`,
                        apiKeyName: s.name || 'access_token'
                    });
                } else {
                    schemes.push({
                        id: 'apikey',
                        name: `API Key - ${key} (${s.name || 'api_key'} in ${s.in || 'header'})`,
                        apiKeyName: s.name || 'X-API-KEY',
                        apiKeyIn: s.in || 'header'
                    });
                }
            } else if (s.type === 'http' && s.scheme === 'bearer') {
                schemes.push({
                    id: 'bearer',
                    name: `Bearer Bearer Token - ${key}`
                });
            } else if (s.type === 'oauth2' || s.type === 'openIdConnect') {
                schemes.push({
                    id: 'bearer',
                    name: `OAuth2 Access Token - ${key}`
                });
            } else if (s.type === 'http' && s.scheme === 'basic') {
                schemes.push({
                    id: 'basic',
                    name: `Basic Authentication - ${key}`
                });
            } else {
                schemes.push({
                    id: 'cookie',
                    name: `Session Cookie - ${key}`
                });
            }
        });

        return schemes;
    };

    const schemes = getAvailableSchemes();

    const handleSaveAuth = () => {
        onUpdateAuth({
            activeScheme: authScheme,
            cookieValues: {access_token: 'active_session_cookie'},
            bearerToken,
            apiKeyName,
            apiKeyValue,
            apiKeyIn,
            basicUsername: basicUser,
            basicPassword: basicPass
        });
        setShowAuthModal(false);
    };

    const getAuthBadge = () => {
        if (!activeAuth.activeScheme || activeAuth.activeScheme === 'none') {
            return (
                <span
                    className="px-2.5 h-6 text-[11px] font-semibold font-sans rounded-md flex items-center gap-1.5 border select-none whitespace-nowrap shrink-0 text-[var(--text-muted)]"
                    style={{
                        backgroundColor: 'rgba(156, 163, 175, 0.1)',
                        borderColor: 'rgba(156, 163, 175, 0.2)'

                    }}>

                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]">
                    </span> Unspecified Auth
                </span>);

        }

        if (activeAuth.activeScheme === 'cookie') {
            return (
                <span
                    className="px-2.5 h-6 text-[11px] font-semibold font-sans rounded-md flex items-center gap-1.5 border select-none whitespace-nowrap shrink-0 text-[var(--method-get)]"
                    style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderColor: 'rgba(16, 185, 129, 0.2)'

                    }}>

                    <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-[var(--method-get)]">
                    </span> Cookie Auth Active
                </span>);

        }

        return (
            <span
                className="px-2.5 h-6 text-[11px] font-semibold font-sans rounded-md flex items-center gap-1.5 border select-none whitespace-nowrap shrink-0 text-[var(--primary)]"
                style={{
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderColor: 'rgba(99, 102, 241, 0.2)'

                }}>

                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]">
                </span> {activeAuth.activeScheme.toUpperCase()} Connected
            </span>);

    };

    return (
        <>
        <div
            className="h-14 sm:h-16 border-b px-2 sm:px-3 flex items-center justify-between select-none shrink-0 font-sans z-30 bg-[var(--navbar)] border-[var(--border)] gap-2">

            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <button
                    onClick={onToggleCollapse}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-all cursor-pointer select-none text-[var(--text-heading)] shrink-0"
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                    <i className={`ph ph-list text-[16px]`}></i>
                </button>

                {/* Logo / Brand */}
                <div className="flex items-center gap-2 hover:opacity-80 transition-all cursor-pointer select-none shrink-0" onClick={onOpenHome}>
                    <span className="size-8 sm:size-10 overflow-hidden"><Logo className={'size-full'}/></span>
                    <span className="font-extrabold text-sm tracking-tight hidden sm:inline-block text-[var(--text-heading)]">OpenDoc UI</span>
                </div>

                <div className="h-6 w-[1px] bg-[var(--border)] hidden md:block"></div>

                {/* API selector */}
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={() => setShowSpecificationModal(true)}
                        className="flex h-8 max-w-[220px] sm:w-48 items-center gap-2 rounded-lg border border-[var(--border)] px-2 sm:px-3 text-left text-[var(--text-heading)] transition-all cursor-pointer"
                        title="Choose an API specification">
                        <i className="ph-fill ph-files shrink-0 text-[14px] text-[var(--primary)]"/>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                            {parsables[selectedParsableKey]?.title || selectedParsableKey || 'API Specifications'}
                        </span>
                        <i className="ph ph-caret-down shrink-0 text-[10px] text-[var(--text-muted)]"/>
                    </button>
                </div>
            </div>

            {/* Desktop search */}
            {!showSchemaExplorer &&
                <div className="hidden md:flex items-center relative max-w-md w-80 lg:w-96 select-none">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Global Search (Ctrl+K)..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-9 pr-14 h-8 text-xs rounded-lg border outline-none focus:border-[var(--primary)] transition-all font-sans border-[var(--border)] text-[var(--text)]"/>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                        <i className="ph ph-magnifying-glass text-[16px]"></i>
                    </div>
                    {searchQuery ? (
                        <button onClick={() => onSearchChange('')} className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer">
                            <i className="ph ph-x text-[14px] text-[var(--text-muted)]"></i>
                        </button>
                    ) : (
                        <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none select-none">
                            <kbd className="px-1.5 py-0.5 text-[9px] font-sans font-extrabold rounded border select-none bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]">Ctrl+K</kbd>
                        </div>
                    )}
                </div>
            }

            {/* Right tools */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Mobile search */}
                {!showSchemaExplorer && (
                    <button
                        onClick={() => setShowMobileSearch(v => !v)}
                        className="size-8 rounded-lg md:hidden flex items-center justify-center border cursor-pointer border-[var(--border)] text-[var(--text-heading)]"
                        title="Search">
                        <i className="ph ph-magnifying-glass text-[16px]"></i>
                    </button>
                )}

                {/* About */}
                <button
                    onClick={onOpenAbout}
                    className={
                        "size-8 rounded-lg border flex items-center justify-center transition-colors text-sm cursor-pointer select-none " +
                        (showAbout
                            ? "bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30"
                            : "border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]")
                    }
                    title="About OpenDoc UI">
                    <i className="ph ph-info text-[16px]"></i>
                </button>

                {/* Home */}
                <button
                    onClick={onOpenHome}
                    className={
                        "hidden sm:flex size-8 rounded-lg border items-center justify-center transition-colors text-sm cursor-pointer select-none " +
                        (showHome && !showAbout
                            ? "bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30"
                            : "border-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--surface-hover)]")
                    }
                    title="Home / Overview">
                    <i className="ph ph-house text-[16px]"></i>
                </button>

                {/* Auth */}
                <div className="hidden sm:flex items-center gap-1.5">
                    <button
                        onClick={() => {
                            setAuthScheme(activeAuth.activeScheme);
                            setBearerToken(activeAuth.bearerToken);
                            setApiKeyName(activeAuth.apiKeyName);
                            setApiKeyValue(activeAuth.apiKeyValue);
                            setApiKeyIn(activeAuth.apiKeyIn);
                            setBasicUser(activeAuth.basicUsername);
                            setBasicPassword(activeAuth.basicPassword);
                            setShowAuthModal(true);
                        }}
                        className="ps-2.5 pe-1 h-8 border cursor-pointer border-[var(--border)] text-[var(--primary)] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all select-none">
                        <i className="ph-fill ph-lock-key text-[14px]"></i>
                        <span className="me-1">Authorize</span>
                        {getAuthBadge()}
                    </button>
                </div>

                {/* Download */}
                <button
                    onClick={onDownloadSpec}
                    className="hidden sm:flex size-8 rounded-lg border items-center justify-center transition-colors text-sm cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]"
                    title="Download specification">
                    <i className="ph-fill ph-download-simple text-[14px] text-[var(--primary)]"></i>
                </button>

                {/* Theme selector */}
                <button
                    type="button"
                    onClick={() => setShowThemeModal(true)}
                    className="hidden lg:flex h-8 items-center gap-2 rounded-lg border px-3 text-left transition-all cursor-pointer border-[var(--border)] text-[var(--text-heading)] w-40"
                    title="Open theme gallery">
                    <i className="ph-fill ph-palette shrink-0 text-[16px] text-[var(--primary)]"></i>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{selectedThemeName}</span>
                    <i className="ph ph-squares-four shrink-0 text-[14px] text-[var(--text-muted)]/60"></i>
                </button>

                <button
                    onClick={onToggleThemeMode}
                    className="size-8 rounded-lg border flex items-center text-[16px] justify-center transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]"
                    title="Toggle light/dark">
                    {currentThemeMode === 'dark'
                        ? <i className="ph ph-sun text-[var(--method-put)]"></i>
                        : <i className="ph-fill ph-moon text-[var(--primary)]"></i>}
                </button>
            </div>
        </div>

        {/* Mobile search bar */}
        {showMobileSearch && !showSchemaExplorer && (
            <div className="md:hidden border-b px-3 py-2 flex items-center gap-2 bg-[var(--navbar)] border-[var(--border)]">
                <div className="relative flex-1">
                    <input
                        ref={searchInputRef}
                        type="text"
                        autoFocus
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-9 pr-8 h-9 text-xs rounded-lg border outline-none focus:border-[var(--primary)] bg-[var(--background)] border-[var(--border)] text-[var(--text)]"/>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                        <i className="ph ph-magnifying-glass text-[14px]"></i>
                    </div>
                    {searchQuery && (
                        <button onClick={() => onSearchChange('')} className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer">
                            <i className="ph ph-x text-[14px] text-[var(--text-muted)]"></i>
                        </button>
                    )}
                </div>
                <button onClick={() => setShowMobileSearch(false)} className="text-xs font-semibold text-[var(--text-muted)] px-2 cursor-pointer">Cancel</button>
            </div>
        )}
        

            {/* Modal: Authorization Settings */}
            {showAuthModal &&
                <div
                    className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-in fade-in duration-100 backdrop-blur-[2px]"
                    style={{backgroundColor: 'rgba(0, 0, 0, 0.4)'}}
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setShowAuthModal(false);
                    }}>
                    <div
                        className="w-full max-w-md border shadow-xl overflow-visible animate-in zoom-in-95 duration-100 max-h-[90vh] flex flex-col bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">


                        <div
                            className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]">

                            <div>
                                <h3 className="font-bold text-sm tracking-tight text-[var(--text-heading)]">
                                    Configure Access Authentications
                                </h3>
                                <p className="text-[10px] mt-0.5 text-[var(--text-muted)]">Set keys or
                                    parameters in accordance with specification security definitions</p>
                            </div>
                            <button
                                onClick={() => setShowAuthModal(false)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-all cursor-pointer select-none text-[var(--text-muted)]"

                                title="Close schema viewer">

                                <i className="ph ph-x"></i>
                            </button>
                        </div>

                        <div className="px-6 py-6 space-y-4 overflow-visible">
                            <div>
                                <label
                                    className="block text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--text-muted)]">
                                    Auth Mechanism</label>
                                <CustomDropdown
                                    value={authScheme}
                                    onChange={(val) => {
                                        setAuthScheme(val);
                                        if (val === 'none') {
                                            setBearerToken('');
                                            setApiKeyValue('');
                                            setBasicUser('');
                                            setBasicPassword('');
                                        }
                                        const match = schemes.find((s) => s.id === val) as any;
                                        if (match && match.id === 'apikey') {
                                            if (match.apiKeyName) setApiKeyName(match.apiKeyName);
                                            if (match.apiKeyIn === 'header' || match.apiKeyIn === 'query') setApiKeyIn(match.apiKeyIn);
                                        }
                                        if (match && match.id === 'cookie' && match.apiKeyName) {
                                            setApiKeyName(match.apiKeyName);
                                        }
                                    }}
                                    options={schemes.map((s) => ({value: s.id, label: s.name}))}
                                    icon="ph ph-shield text-[16px]"
                                    className="w-full"/>

                            </div>

                            {/* Cookie Auth Section */}
                            {authScheme === 'cookie' &&
                                <div id="auth-cookie-section" className="space-y-4 animate-in fade-in duration-105">
                                    <div
                                        className="border p-3 rounded-lg text-xs leading-relaxed bg-[var(--background)] border-[var(--border)] text-[var(--text)]">


                                        <p className="font-semibold mb-1 text-[var(--text-heading)]">🍪
                                            Cookie integration mode</p>
                                        <p>When running this applet and target endpoints on the **same domain**, browser
                                            automatically transacts cookies (laravel, express sessions, cookies)
                                            natively in queries.</p>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label
                                                className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                                Validate Token Cookie
                                                Key</label>
                                            <input
                                                type="text"
                                                placeholder="access_token"
                                                value={apiKeyName}
                                                onChange={(e) => setApiKeyName(e.target.value)}
                                                className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"/>


                                        </div>
                                    </div>
                                </div>
                            }

                            {/* Bearer Token Section */}
                            {authScheme === 'bearer' &&
                                <div className="space-y-3 animate-in fade-in duration-105">
                                    <label className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                        Bearer Token Value</label>
                                    <input
                                        type="text"
                                        placeholder="bearer eyJ..."
                                        value={bearerToken}
                                        onChange={(e) => setBearerToken(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"/>


                                </div>
                            }

                            {/* Basic Auth Section */}
                            {authScheme === 'basic' &&
                                <div className="space-y-3 animate-in fade-in duration-105">
                                    <div>
                                        <label
                                            className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                            Username</label>
                                        <input
                                            type="text"
                                            placeholder="admin"
                                            value={basicUser}
                                            onChange={(e) => setBasicUser(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"/>


                                    </div>
                                    <div>
                                        <label
                                            className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                            Password</label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            value={basicPass}
                                            onChange={(e) => setBasicPassword(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"/>


                                    </div>
                                </div>
                            }

                            {/* API Key Section */}
                            {authScheme === 'apikey' &&
                                <div className="space-y-3 animate-in fade-in duration-105">
                                    <div>
                                        <label
                                            className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                            API Key Header/Query Name</label>
                                        <input
                                            type="text"
                                            placeholder="X-API-KEY"
                                            value={apiKeyName}
                                            onChange={(e) => setApiKeyName(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"/>


                                    </div>
                                    <div>
                                        <label
                                            className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                            API Key secret string</label>
                                        <input
                                            type="text"
                                            placeholder="MY_SECRET_KEY"
                                            value={apiKeyValue}
                                            onChange={(e) => setApiKeyValue(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors bg-[var(--background)] border-[var(--border)] text-[var(--text-heading)]"/>


                                    </div>
                                    <div>
                                        <label
                                            className="block text-[10.5px] font-semibold mb-1 text-[var(--text-muted)]">
                                            API Key Source In</label>
                                        <CustomDropdown
                                            value={apiKeyIn}
                                            onChange={(val) => setApiKeyIn(val as 'header' | 'query')}
                                            options={[
                                                {value: 'header', label: 'Header'},
                                                {value: 'query', label: 'Query URL Attribute'}]
                                            }
                                            icon="ph ph-arrow-elbow-down-right"
                                            className="w-full"/>

                                    </div>
                                </div>
                            }
                        </div>

                        <div
                            className="px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--background)]">

                            <button
                                onClick={() => setShowAuthModal(false)}
                                className="px-4 py-2 border rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none border-[var(--border)] text-[var(--text-heading)]">


                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAuth}
                                className="px-4 py-2 text-[var(--primary-contrast)] bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-95 text-xs font-semibold rounded-xl transition-all cursor-pointer select-none">

                                Apply Authorize
                            </button>
                        </div>
                    </div>
                </div>
            }

            <ApiSpecificationSelectorModal
                isOpen={showSpecificationModal}
                specifications={parsables}
                selectedKey={selectedParsableKey}
                activeSpecification={spec}
                onSelect={onSelectParsable}
                onClose={() => setShowSpecificationModal(false)}/>


            <ThemeSelectorModal
                isOpen={showThemeModal}
                selectedThemeName={selectedThemeName}
                currentThemeMode={currentThemeMode}
                onSelectTheme={onSelectTheme}
                onToggleThemeMode={onToggleThemeMode}
                onClose={() => setShowThemeModal(false)}/>
        </>
    );
}