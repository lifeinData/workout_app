/// <reference types="nativewind/types" />

declare module "*.css" {
  const classes: { [key: string]: any };
  export default classes;
}
declare module "*.module.css" {
  const classes: { [key: string]: any };
  export default classes;
}
