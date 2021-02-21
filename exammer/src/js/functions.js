function toPersianNum(num, dontTrim) {

    var i = 0,

        dontTrim = dontTrim || false,

        num = dontTrim ? num.toString() : num.toString().trim(),
        len = num.length,

        res = '',
        pos,

        persianNumbers = typeof persianNumber == 'undefined' ?
            ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] :
            persianNumbers;

    for (; i < len; i++)
        if (( pos = persianNumbers[num.charAt(i)] ))
            res += pos;
        else
            res += num.charAt(i);

    return res;
}

function getUrlParameters() {
    let search = location.search.slice(1);
    let params = {};
    try {
        params = JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g,'":"') + '"}', function(key, value) {
            return key===""?value:decodeURIComponent(value)
        });
    } catch(e) {
    }
    if(arguments.length > 0) {
        return params[arguments[0]];
    } else {
        return params;
    }
}

function getNow() {
    return parseInt($.ajax({
        url: 'https://amirnaderi.ir/exammer/getNow.php',
        async: false
    }).responseText);
}