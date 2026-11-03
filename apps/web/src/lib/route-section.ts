export function routeSection(pathname: string): string {
  const segment = pathname.split('/')[1];
  return segment || 'home';
}
