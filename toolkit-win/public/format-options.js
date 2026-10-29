export const FORMAT_OPTIONS={
 photo:{title:'Photo formats',accept:'image/*,.jpg,.jpeg,.png,.webp,.avif,.bmp,.tif,.tiff,.gif,.dng',limit:25,formats:[['jpg','JPG','image/jpeg'],['png','PNG','image/png'],['webp','WebP','image/webp'],['avif','AVIF','image/avif'],['tiff','TIFF','image/tiff'],['dng','DNG · linear RGB','image/x-adobe-dng']]},
 audio:{title:'Audio formats',accept:'audio/*,.mp3,.flac,.wav,.m4a,.aac,.opus,.ogg,.aiff,.wma',limit:100,formats:[['mp3','MP3','audio/mpeg'],['flac','FLAC','audio/flac'],['alac','ALAC · M4A','audio/mp4','m4a'],['wav','WAV · 24-bit PCM','audio/wav'],['m4a','M4A · AAC','audio/mp4'],['aac','AAC','audio/aac'],['opus','Opus','audio/ogg'],['ogg','OGG · Vorbis','audio/ogg']]},
 video:{title:'Video formats',accept:'video/*,.mp4,.webm,.mkv,.mov,.avi,.m4v,.mpeg,.mpg,.ts,.flv,.wmv',limit:250,formats:[['mp4','MP4','video/mp4'],['webm','WebM','video/webm'],['mkv','MKV','video/x-matroska'],['mov','MOV · H.264','video/quicktime'],['prores','ProRes 422 HQ · MOV','video/quicktime','mov'],['avi','AVI','video/x-msvideo']]},
};
export function formatOption(kind,format){
 const option=FORMAT_OPTIONS[kind]?.formats?.find(([name])=>name===format);
 if(!option)throw new Error('Choose a supported photo, audio or video output format.');
 return option;
}

export function formatExtension(kind,format){const option=formatOption(kind,format);return option[3]||option[0];}
