
function checkRole(role) {
    return (req,res,next)=> {
        if(req.user && req.user.tipo === role){
            next();
        } else {
            res.status(403).json({ mensagem: 'Acesso negado. Voce nao tem permissao para acessar esse recurso.' });
        }
    };
}

module.exports = checkRole;