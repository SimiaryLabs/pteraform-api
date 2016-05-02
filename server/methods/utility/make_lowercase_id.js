makeLowercaseAlphaNumId = function (len)
{
    var text = "";
    if (len > 48)
      return text;
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < len; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}


makeLowercaseAlphaId = function (len)
{
    var text = "";
    if (len > 48)
      return text;
    var possible = "abcdefghijklmnopqrstuvwxyz";

    for( var i=0; i < len; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}
