function checkUserPermission(req,res, next){
    const usuarioLogado = req.user;

    const idDoRecurso = req.params.id;
    if(usuarioLogado.tipo === 'ADMIN'){
        return next(); // permite acesso total ao administrador
    }
    if(usuarioLogado.id_usuario == idDoRecurso){
        return next(); // permite acesso ao usuário para seus próprios recursos
    }

    res.status(403).json({ mensagem: 'Acesso negado. Voce nao tem permissao para acessar esse recurso.' });
}

module.exports = checkUserPermission;