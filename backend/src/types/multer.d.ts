// multer 자체는 최소한(memoryStorage, single(field), fileFilter)만 쓰므로
// @types/multer 패키지를 쓰지 않고 여기서 직접 최소 타입만 선언한다.
// (@types/multer가 끌어오는 중첩된 @types/express 사본이 배포 환경에서 버전
// 충돌을 일으켜 tsc 빌드가 깨지는 문제를 원천적으로 피하기 위함)
declare module 'multer' {
  const multer: any;
  export default multer;
}
