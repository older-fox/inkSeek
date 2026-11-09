/** Returns the top-level route segment used to highlight navigation, defaulting to home. */
export function routeSection(pathname: string): string {
  const segment = pathname.split('/')[1];
  return segment || 'home';
}
