// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StudentSBT.sol";
import "./UNQToken.sol";

/// @title Gobernanza estudiantil de la Universidad Nacional de Quilmes.
contract UNQStudentDAO {
    StudentSBT public immutable studentSBT;
    UNQToken public immutable unqToken;
    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        address proposer;
        string descriptionHash;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        bool approved;
        mapping(address => bool) hasVoted;
    }

    mapping(uint256 => Proposal) private _proposals;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string descriptionHash, uint256 endTime);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, bool approved);

    constructor(address studentSBTAddress, address unqTokenAddress) {
        require(studentSBTAddress != address(0) && unqTokenAddress != address(0), "DAO: direccion invalida");
        studentSBT = StudentSBT(studentSBTAddress);
        unqToken = UNQToken(unqTokenAddress);
        require(address(unqToken.studentSBT()) == studentSBTAddress, "DAO: SBT no coincide con el token");
    }

    /// @dev Limita la creación de propuestas y los votos a alumnos con credencial.
    modifier onlyStudent() {
        require(studentSBT.balanceOf(msg.sender) > 0, "DAO: solo estudiantes");
        _;
    }

    /// @notice Crea una propuesta cuyo detalle está en IPFS y cuya votación dura minutos.
    function createProposal(string memory descriptionHash, uint256 durationInMinutes)
        external
        onlyStudent
        returns (uint256)
    {
        require(bytes(descriptionHash).length > 0, "DAO: hash vacio");
        require(durationInMinutes > 0, "DAO: duracion invalida");
        uint256 id = ++proposalCount;
        Proposal storage proposal = _proposals[id];
        proposal.id = id;
        proposal.proposer = msg.sender;
        proposal.descriptionHash = descriptionHash;
        proposal.startTime = block.timestamp;
        proposal.endTime = block.timestamp + durationInMinutes * 1 minutes;
        emit ProposalCreated(id, msg.sender, descriptionHash, proposal.endTime);
        return id;
    }

    /// @notice Vota una sola vez; el peso corresponde al balance UNQC actual.
    function vote(uint256 proposalId, bool support) external onlyStudent {
        Proposal storage proposal = _proposals[proposalId];
        require(proposal.id != 0, "DAO: propuesta inexistente");
        require(block.timestamp >= proposal.startTime && block.timestamp <= proposal.endTime, "DAO: votacion cerrada");
        require(!proposal.hasVoted[msg.sender], "DAO: ya voto");
        // balanceOf devuelve unidades con 18 decimales; cada UNQC entero vale 1 voto.
        uint256 weight = unqToken.balanceOf(msg.sender) / 1 ether;
        require(weight > 0, "DAO: se requieren tokens");
        proposal.hasVoted[msg.sender] = true;
        if (support) proposal.votesFor += weight;
        else proposal.votesAgainst += weight;
        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    /// @notice Cierra una votación y registra si la propuesta obtuvo más votos a favor.
    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = _proposals[proposalId];
        require(proposal.id != 0, "DAO: propuesta inexistente");
        require(block.timestamp > proposal.endTime, "DAO: votacion no finalizada");
        require(!proposal.executed, "DAO: ya ejecutada");
        proposal.approved = proposal.votesFor > proposal.votesAgainst;
        proposal.executed = true;
        emit ProposalExecuted(proposalId, proposal.approved);
    }

    /// @notice Devuelve los datos visibles de una propuesta (sin el mapeo privado de votos).
    function getProposal(uint256 proposalId)
        external
        view
        returns (uint256 id, address proposer, string memory descriptionHash, uint256 votesFor,
            uint256 votesAgainst, uint256 startTime, uint256 endTime, bool executed, bool approved)
    {
        Proposal storage proposal = _proposals[proposalId];
        require(proposal.id != 0, "DAO: propuesta inexistente");
        return (proposal.id, proposal.proposer, proposal.descriptionHash, proposal.votesFor,
            proposal.votesAgainst, proposal.startTime, proposal.endTime, proposal.executed,
            proposal.approved);
    }

    /// @notice Consulta si una wallet ya votó en una propuesta.
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return _proposals[proposalId].hasVoted[voter];
    }
}
